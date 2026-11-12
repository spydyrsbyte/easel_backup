package server

import (
	"encoding/json"
	"errors"
	"mime"
	"net"
	"net/http"
	"net/url"
	"time"

	"easel/internal/accounts"
)

const (
	sessionCookie = "easel_session"
	maxBodyBytes  = 16 << 10
)

type Config struct {
	FrontendDir   string
	Router        GameRouter
	Accounts      *accounts.Service
	Providers     map[string]*accounts.Provider
	PublicURL     string
	SecureCookies bool
	Logins        *accounts.Limiter
	Policy        SignInPolicy
	ReportError   func(*http.Request, error)
}

type handler struct {
	config Config
	origin string
	auth   *Authenticator
}

func NewHandler(config Config) http.Handler {
	if config.FrontendDir == "" {
		config.FrontendDir = "easel"
	}
	mux := http.NewServeMux()
	if config.Accounts == nil {
		return mux
	}
	if config.Logins == nil {
		config.Logins = &accounts.Limiter{Max: 10, Window: 15 * time.Minute}
	}
	h := &handler{config: config, auth: &Authenticator{Accounts: config.Accounts, Providers: config.Providers, Logins: config.Logins, Policy: config.Policy}}
	if public, err := url.Parse(config.PublicURL); err == nil {
		h.origin = public.Scheme + "://" + public.Host
	}
	mux.HandleFunc("POST /api/accounts", h.signUp)
	mux.HandleFunc("POST /api/sessions", h.logIn)
	mux.HandleFunc("POST /api/sessions/response", h.respondChallenge)
	mux.HandleFunc("DELETE /api/sessions", h.logOut)
	mux.HandleFunc("GET /api/me", h.me)
	mux.HandleFunc("GET /auth/{provider}/start", h.startSignIn)
	mux.HandleFunc("GET /auth/{provider}/callback", h.finishSignIn)
	mux.HandleFunc("GET /{$}", h.index)
	mux.HandleFunc("GET /runtime/{file}", h.browserFile)
	mux.HandleFunc("GET /runtime/shell/{package}/{file...}", h.shellAsset)
	mux.HandleFunc("GET /api/providers", h.providers)
	mux.HandleFunc("GET /api/fetch", h.fetch)
	mux.HandleFunc("GET /client/{type}", h.clientSocket)
	mux.HandleFunc("GET /assets/{package}/{file...}", h.clientAsset)
	return h.protect(mux)
}

func (h *handler) protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if origin := r.Header.Get("Origin"); origin != "" && origin != h.origin {
				h.fail(w, r, http.StatusForbidden, "cross-site request rejected", nil)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (h *handler) fail(w http.ResponseWriter, r *http.Request, status int, message string, err error) {
	if status >= http.StatusInternalServerError && h.config.ReportError != nil && err != nil {
		h.config.ReportError(r, err)
	}
	h.write(w, status, map[string]string{"error": message})
}

func (h *handler) write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (h *handler) decode(w http.ResponseWriter, r *http.Request, target any) bool {
	if media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || media != "application/json" {
		h.fail(w, r, http.StatusUnsupportedMediaType, "request body must be application/json", nil)
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		h.fail(w, r, http.StatusBadRequest, "invalid request body", nil)
		return false
	}
	return true
}

func (h *handler) setSession(w http.ResponseWriter, result AuthResult) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: result.Token, Path: "/", Expires: result.Expires, HttpOnly: true, Secure: h.config.SecureCookies, SameSite: http.SameSiteLaxMode})
}

func (h *handler) authFail(w http.ResponseWriter, r *http.Request, err error) {
	status, message := authError(err)
	h.fail(w, r, status, message, err)
}

func (h *handler) respond(w http.ResponseWriter, r *http.Request, status int, result AuthResult, err error) {
	switch {
	case err != nil:
		h.authFail(w, r, err)
	case result.Refused != "":
		h.fail(w, r, http.StatusForbidden, result.Refused, nil)
	case result.Challenge != "":
		h.write(w, http.StatusAccepted, map[string]any{"challenge": result.Challenge, "challengeToken": result.ChallengeToken})
	default:
		h.setSession(w, result)
		h.write(w, status, map[string]any{"user": result.User})
	}
}

func (h *handler) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: h.config.SecureCookies, SameSite: http.SameSiteLaxMode})
}

func sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (h *handler) currentUser(r *http.Request) (accounts.User, error) {
	return h.config.Accounts.SessionUser(r.Context(), sessionToken(r))
}

func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (h *handler) signUp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if !h.decode(w, r, &body) {
		return
	}
	result, err := h.auth.SignUp(r.Context(), SignIn{Username: body.Username, Password: body.Password, DisplayName: body.DisplayName, Client: "http", Address: clientAddress(r)})
	h.respond(w, r, http.StatusCreated, result, err)
}

func (h *handler) respondChallenge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChallengeToken string `json:"challengeToken"`
		Response       any    `json:"response"`
	}
	if !h.decode(w, r, &body) {
		return
	}
	result, err := h.auth.Respond(r.Context(), body.ChallengeToken, body.Response)
	h.respond(w, r, http.StatusOK, result, err)
}

func (h *handler) logIn(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !h.decode(w, r, &body) {
		return
	}
	result, err := h.auth.SignIn(r.Context(), SignIn{Method: "password", Username: body.Username, Password: body.Password, Client: "http", Address: clientAddress(r)})
	h.respond(w, r, http.StatusOK, result, err)
}

func (h *handler) logOut(w http.ResponseWriter, r *http.Request) {
	if token := sessionToken(r); token != "" {
		if err := h.config.Accounts.EndSession(r.Context(), token); err != nil {
			h.fail(w, r, http.StatusInternalServerError, "internal error", err)
			return
		}
	}
	h.clearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) me(w http.ResponseWriter, r *http.Request) {
	user, err := h.currentUser(r)
	if errors.Is(err, accounts.ErrNoSession) {
		h.fail(w, r, http.StatusUnauthorized, "not signed in", nil)
		return
	}
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "internal error", err)
		return
	}
	h.write(w, http.StatusOK, map[string]any{"user": user})
}

func (h *handler) provider(w http.ResponseWriter, r *http.Request) *accounts.Provider {
	provider := h.config.Providers[r.PathValue("provider")]
	if provider == nil {
		h.fail(w, r, http.StatusNotFound, "unknown sign-in provider", nil)
	}
	return provider
}

func (h *handler) startSignIn(w http.ResponseWriter, r *http.Request) {
	provider := h.provider(w, r)
	if provider == nil {
		return
	}
	link := ""
	if r.URL.Query().Get("link") == "1" {
		user, err := h.currentUser(r)
		if err != nil {
			h.fail(w, r, http.StatusUnauthorized, "sign in before linking another sign-in method", nil)
			return
		}
		link = user.ID
	}
	verifier := accounts.NewVerifier()
	state, err := h.config.Accounts.SaveState(r.Context(), provider.Name, verifier, link)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "internal error", err)
		return
	}
	http.Redirect(w, r, provider.AuthCodeURL(state, verifier), http.StatusFound)
}

func (h *handler) finishSignIn(w http.ResponseWriter, r *http.Request) {
	provider := h.provider(w, r)
	if provider == nil {
		return
	}
	query := r.URL.Query()
	if query.Get("error") != "" {
		h.fail(w, r, http.StatusBadRequest, "sign-in was cancelled or refused", nil)
		return
	}
	verifier, link, err := h.config.Accounts.TakeState(r.Context(), provider.Name, query.Get("state"))
	if errors.Is(err, accounts.ErrInvalidState) {
		h.fail(w, r, http.StatusBadRequest, err.Error(), nil)
		return
	}
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "internal error", err)
		return
	}
	result, err := h.auth.SignIn(r.Context(), SignIn{Method: "provider", Provider: provider.Name, Code: query.Get("code"), Verifier: verifier, Link: link, Client: "http", Address: clientAddress(r)})
	switch {
	case err != nil:
		h.authFail(w, r, err)
	case result.Refused != "":
		h.fail(w, r, http.StatusForbidden, result.Refused, nil)
	case result.Challenge != "":
		http.Redirect(w, r, "/#"+url.Values{"challenge": {result.Challenge}, "challengeToken": {result.ChallengeToken}}.Encode(), http.StatusFound)
	default:
		h.setSession(w, result)
		http.Redirect(w, r, "/", http.StatusFound)
	}
}
