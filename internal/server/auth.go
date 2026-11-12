package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"easel/internal/accounts"
	"easel/internal/jsapi"
)

const (
	challengeLifetime = 10 * time.Minute
	maxChallenges     = 10000
)

var (
	ErrRateLimited       = errors.New("too many failed sign-in attempts; try again later")
	ErrChallengeExpired  = errors.New("challenge expired or is invalid")
	ErrTooManyChallenges = errors.New("too many sign-ins are waiting on a challenge; try again later")
	ErrUnknownProvider   = errors.New("unknown sign-in provider")
	ErrProviderFailed    = errors.New("could not complete sign-in with the provider")
)

type SignInPolicy interface {
	Evaluate(context.Context, string, map[string]any) (jsapi.AuthDecision, error)
}

type SignIn struct {
	Method      string
	Username    string
	Password    string
	DisplayName string
	Provider    string
	Code        string
	Verifier    string
	Redirect    string
	Link        string
	Client      string
	Address     string
}

type AuthResult struct {
	User           accounts.User
	Token          string
	Expires        time.Time
	Challenge      string
	ChallengeToken string
	Refused        string
}

type pendingSignIn struct {
	hook      string
	client    string
	fields    map[string]any
	user      accounts.User
	create    func(context.Context) (accounts.User, error)
	challenge string
	expires   time.Time
}

type Authenticator struct {
	Accounts  *accounts.Service
	Providers map[string]*accounts.Provider
	Logins    *accounts.Limiter
	Policy    SignInPolicy
	Now       func() time.Time

	mu         sync.Mutex
	challenges map[string]*pendingSignIn
}

func (a *Authenticator) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func userFields(user accounts.User) map[string]any {
	return map[string]any{"id": user.ID, "displayName": user.DisplayName}
}

func (a *Authenticator) evaluate(ctx context.Context, hook string, fields map[string]any) (jsapi.AuthDecision, error) {
	if a.Policy == nil {
		return jsapi.AuthDecision{Outcome: jsapi.AuthRefuse, Reason: "sign-in is not allowed"}, nil
	}
	return a.Policy.Evaluate(ctx, hook, fields)
}

func (a *Authenticator) Methods() map[string]any {
	providers := []string{}
	for name := range a.Providers {
		providers = append(providers, name)
	}
	sort.Strings(providers)
	return map[string]any{"methods": []string{"password", "provider"}, "providers": providers}
}

func (a *Authenticator) SignIn(ctx context.Context, request SignIn) (AuthResult, error) {
	switch request.Method {
	case "password":
		return a.passwordSignIn(ctx, request)
	case "provider":
		return a.providerSignIn(ctx, request)
	}
	return AuthResult{}, fmt.Errorf("%w: unknown sign-in method", accounts.ErrInvalidInput)
}

func (a *Authenticator) passwordSignIn(ctx context.Context, request SignIn) (AuthResult, error) {
	userKey := "user:" + strings.ToLower(request.Username)
	addressKey := "address:" + request.Address
	if !a.Logins.Allow(userKey) || !a.Logins.Allow(addressKey) {
		return AuthResult{}, ErrRateLimited
	}
	user, err := a.Accounts.Login(ctx, request.Username, request.Password)
	if errors.Is(err, accounts.ErrInvalidCredentials) {
		a.Logins.Fail(userKey)
		a.Logins.Fail(addressKey)
	}
	if err != nil {
		return AuthResult{}, err
	}
	a.Logins.Reset(userKey)
	return a.authorize(ctx, &pendingSignIn{hook: "signIn", client: request.Client, user: user, fields: map[string]any{"method": "password", "user": userFields(user)}})
}

func (a *Authenticator) providerSignIn(ctx context.Context, request SignIn) (AuthResult, error) {
	provider := a.Providers[request.Provider]
	if provider == nil {
		return AuthResult{}, ErrUnknownProvider
	}
	profile, err := provider.ProfileFor(ctx, request.Code, request.Verifier, request.Redirect)
	if err != nil {
		return AuthResult{}, fmt.Errorf("%w: %w", ErrProviderFailed, err)
	}
	link := func(ctx context.Context) (accounts.User, error) {
		return a.Accounts.IdentityLogin(ctx, provider.Name, profile, request.Link)
	}
	if request.Link != "" {
		user, err := a.Accounts.User(ctx, request.Link)
		if err != nil {
			return AuthResult{}, err
		}
		if existing, err := a.Accounts.FindIdentity(ctx, provider.Name, profile.Subject); err == nil && existing.ID != user.ID {
			return AuthResult{}, accounts.ErrIdentityLinked
		}
		return a.authorize(ctx, &pendingSignIn{hook: "signIn", client: request.Client, user: user, create: link, fields: map[string]any{"method": "provider", "provider": provider.Name, "user": userFields(user), "link": true}})
	}
	user, err := a.Accounts.FindIdentity(ctx, provider.Name, profile.Subject)
	if err == nil {
		return a.authorize(ctx, &pendingSignIn{hook: "signIn", client: request.Client, user: user, fields: map[string]any{"method": "provider", "provider": provider.Name, "user": userFields(user)}})
	}
	if !errors.Is(err, accounts.ErrNoIdentity) {
		return AuthResult{}, err
	}
	return a.authorize(ctx, &pendingSignIn{hook: "signUp", client: request.Client, create: link, fields: map[string]any{"method": "provider", "provider": provider.Name, "displayName": profile.Name}})
}

func (a *Authenticator) SignUp(ctx context.Context, request SignIn) (AuthResult, error) {
	account, err := accounts.PreparePassword(request.Username, request.Password, request.DisplayName)
	if err != nil {
		return AuthResult{}, err
	}
	create := func(ctx context.Context) (accounts.User, error) { return a.Accounts.CreatePassword(ctx, account) }
	return a.authorize(ctx, &pendingSignIn{hook: "signUp", client: request.Client, create: create, fields: map[string]any{"method": "password", "username": account.Username, "displayName": account.DisplayName}})
}

func (a *Authenticator) Respond(ctx context.Context, id string, response any) (AuthResult, error) {
	a.mu.Lock()
	pending := a.challenges[id]
	delete(a.challenges, id)
	a.mu.Unlock()
	if pending == nil || !pending.expires.After(a.now()) {
		return AuthResult{}, ErrChallengeExpired
	}
	fields := map[string]any{}
	for key, value := range pending.fields {
		fields[key] = value
	}
	fields["hook"], fields["challengeName"], fields["value"] = pending.hook, pending.challenge, response
	decision, err := a.evaluate(ctx, "response", fields)
	if err != nil {
		return AuthResult{}, err
	}
	return a.enforce(ctx, pending, decision)
}

func (a *Authenticator) authorize(ctx context.Context, pending *pendingSignIn) (AuthResult, error) {
	fields := map[string]any{"client": pending.client}
	for key, value := range pending.fields {
		fields[key] = value
	}
	pending.fields = fields
	decision, err := a.evaluate(ctx, pending.hook, fields)
	if err != nil {
		return AuthResult{}, err
	}
	return a.enforce(ctx, pending, decision)
}

func (a *Authenticator) enforce(ctx context.Context, pending *pendingSignIn, decision jsapi.AuthDecision) (AuthResult, error) {
	switch decision.Outcome {
	case jsapi.AuthRefuse:
		return AuthResult{Refused: refusal(decision.Reason)}, nil
	case jsapi.AuthChallenge:
		id, err := a.storeChallenge(pending, decision.Challenge)
		if err != nil {
			return AuthResult{}, err
		}
		return AuthResult{Challenge: decision.Challenge, ChallengeToken: id}, nil
	}
	user := pending.user
	if pending.create != nil {
		created, err := pending.create(ctx)
		if err != nil {
			return AuthResult{}, err
		}
		user = created
	}
	token, expires, err := a.Accounts.StartSession(ctx, user.ID)
	if err != nil {
		return AuthResult{}, err
	}
	signedIn, err := a.evaluate(ctx, "signedIn", map[string]any{"client": pending.client, "user": userFields(user)})
	if err == nil && signedIn.Outcome != jsapi.AuthAllow {
		err = a.Accounts.EndSession(ctx, token)
		if err == nil {
			return AuthResult{Refused: refusal(signedIn.Reason)}, nil
		}
	}
	if err != nil {
		_ = a.Accounts.EndSession(context.WithoutCancel(ctx), token)
		return AuthResult{}, err
	}
	return AuthResult{User: user, Token: token, Expires: expires}, nil
}

func refusal(reason string) string {
	if reason == "" {
		return "sign-in is not allowed"
	}
	return reason
}

func (a *Authenticator) storeChallenge(pending *pendingSignIn, challenge string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate challenge token: %w", err)
	}
	id := base64.RawURLEncoding.EncodeToString(raw)
	now := a.now()
	pending.challenge = challenge
	pending.expires = now.Add(challengeLifetime)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.challenges == nil {
		a.challenges = map[string]*pendingSignIn{}
	}
	for key, held := range a.challenges {
		if !held.expires.After(now) {
			delete(a.challenges, key)
		}
	}
	if len(a.challenges) >= maxChallenges {
		return "", ErrTooManyChallenges
	}
	a.challenges[id] = pending
	return id, nil
}

func authError(err error) (int, string) {
	switch {
	case errors.Is(err, accounts.ErrUsernameTaken), errors.Is(err, accounts.ErrIdentityLinked):
		return http.StatusConflict, err.Error()
	case errors.Is(err, accounts.ErrInvalidInput):
		return http.StatusBadRequest, strings.TrimPrefix(err.Error(), "invalid input: ")
	case errors.Is(err, accounts.ErrInvalidCredentials):
		return http.StatusUnauthorized, err.Error()
	case errors.Is(err, ErrRateLimited), errors.Is(err, ErrTooManyChallenges):
		return http.StatusTooManyRequests, err.Error()
	case errors.Is(err, ErrChallengeExpired), errors.Is(err, accounts.ErrInvalidState):
		return http.StatusBadRequest, err.Error()
	case errors.Is(err, ErrUnknownProvider):
		return http.StatusNotFound, err.Error()
	case errors.Is(err, ErrProviderFailed):
		return http.StatusBadGateway, ErrProviderFailed.Error()
	}
	return http.StatusInternalServerError, "internal error"
}
