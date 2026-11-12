package accounts

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	sessionLifetime = 30 * 24 * time.Hour
	stateLifetime   = 10 * time.Minute
	tokenBytes      = 32
	maxDisplayName  = 64
	uniqueViolation = "23505"
	usernamePattern = `^[A-Za-z0-9_.-]{3,32}$`
)

var (
	ErrInvalidInput       = errors.New("invalid input")
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrUsernameTaken      = errors.New("username is already taken")
	ErrNoSession          = errors.New("no valid session")
	ErrInvalidState       = errors.New("sign-in request expired or is invalid")
	ErrIdentityLinked     = errors.New("identity is already linked to another account")
	ErrNoIdentity         = errors.New("identity is not linked to an account")
	ErrNoAccount          = errors.New("account does not exist")
)

var username = regexp.MustCompile(usernamePattern)

var dummyHash = func() string {
	hash, err := HashPassword("easel-timing-equalizer")
	if err != nil {
		panic(err)
	}
	return hash
}()

type User struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type Service struct {
	Pool     *pgxpool.Pool
	ServerID string
	Now      func() time.Time
}

func (s *Service) server() string { return database.ServerID(s.ServerID) }

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func newToken() (string, []byte, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, hashToken(token), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

func cleanDisplayName(name, fallback string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = fallback
	}
	if name == "" || utf8.RuneCountInString(name) > maxDisplayName {
		return "", fmt.Errorf("%w: display name must be 1 to %d characters", ErrInvalidInput, maxDisplayName)
	}
	return name, nil
}

type PasswordAccount struct {
	Username    string
	DisplayName string
	hash        string
}

func PreparePassword(name, password, displayName string) (PasswordAccount, error) {
	if !username.MatchString(name) {
		return PasswordAccount{}, fmt.Errorf("%w: username must be 3 to 32 letters, digits, underscores, dots, or dashes", ErrInvalidInput)
	}
	if err := checkPassword(password); err != nil {
		return PasswordAccount{}, err
	}
	display, err := cleanDisplayName(displayName, name)
	if err != nil {
		return PasswordAccount{}, err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return PasswordAccount{}, err
	}
	return PasswordAccount{Username: name, DisplayName: display, hash: hash}, nil
}

func (s *Service) SignUp(ctx context.Context, name, password, displayName string) (User, error) {
	account, err := PreparePassword(name, password, displayName)
	if err != nil {
		return User{}, err
	}
	return s.CreatePassword(ctx, account)
}

func (s *Service) CreatePassword(ctx context.Context, account PasswordAccount) (User, error) {
	if account.hash == "" {
		return User{}, fmt.Errorf("%w: account was not prepared", ErrInvalidInput)
	}
	tx, err := database.BeginSerializable(ctx, s.Pool)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(context.Background())
	user := User{DisplayName: account.DisplayName}
	if err := tx.QueryRow(ctx, `INSERT INTO accounts.users(display_name,server_id) VALUES($1,$2) RETURNING user_id::text`, account.DisplayName, s.server()).Scan(&user.ID); err != nil {
		return User{}, fmt.Errorf("create account: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO accounts.passwords(user_id,username,hash,server_id) VALUES($1,$2,$3,$4)`, user.ID, account.Username, account.hash, s.server()); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
			return User{}, ErrUsernameTaken
		}
		return User{}, fmt.Errorf("store password: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, fmt.Errorf("commit account: %w", err)
	}
	return user, nil
}

func (s *Service) Login(ctx context.Context, name, password string) (User, error) {
	var user User
	var hash string
	err := s.Pool.QueryRow(ctx, `SELECT u.user_id::text,u.display_name,p.hash FROM accounts.passwords p JOIN accounts.users u USING(user_id) WHERE lower(p.username)=lower($1) AND p.server_id=$2`, name, s.server()).Scan(&user.ID, &user.DisplayName, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		_, _ = VerifyPassword(dummyHash, password)
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, fmt.Errorf("look up account: %w", err)
	}
	matched, err := VerifyPassword(hash, password)
	if err != nil {
		return User{}, err
	}
	if !matched {
		return User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (s *Service) StartSession(ctx context.Context, userID string) (string, time.Time, error) {
	token, hash, err := newToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expires := s.now().Add(sessionLifetime)
	started, err := s.Pool.Exec(ctx, `INSERT INTO accounts.sessions(token_hash,user_id,expires_at) SELECT $1,user_id,$3 FROM accounts.users WHERE user_id::text=$2 AND server_id=$4`, hash, userID, expires, s.server())
	if err != nil {
		return "", time.Time{}, fmt.Errorf("start session: %w", err)
	}
	if started.RowsAffected() != 1 {
		return "", time.Time{}, ErrNoAccount
	}
	return token, expires, nil
}

func (s *Service) SessionUser(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrNoSession
	}
	var user User
	err := s.Pool.QueryRow(ctx, `SELECT u.user_id::text,u.display_name FROM accounts.sessions s JOIN accounts.users u USING(user_id) WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.server_id=$3`, hashToken(token), s.now(), s.server()).Scan(&user.ID, &user.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNoSession
	}
	if err != nil {
		return User{}, fmt.Errorf("read session: %w", err)
	}
	return user, nil
}

func (s *Service) EndSession(ctx context.Context, token string) error {
	if _, err := s.Pool.Exec(ctx, `DELETE FROM accounts.sessions s USING accounts.users u WHERE s.user_id=u.user_id AND s.token_hash=$1 AND u.server_id=$2`, hashToken(token), s.server()); err != nil {
		return fmt.Errorf("end session: %w", err)
	}
	return nil
}

func (s *Service) SaveState(ctx context.Context, provider, verifier, linkUserID string) (string, error) {
	state, hash, err := newToken()
	if err != nil {
		return "", err
	}
	var link *string
	if linkUserID != "" {
		link = &linkUserID
	}
	if _, err := s.Pool.Exec(ctx, `INSERT INTO accounts.oauth_states(state_hash,provider,verifier,link_user_id,expires_at,server_id) VALUES($1,$2,$3,$4::uuid,$5,$6)`, hash, provider, verifier, link, s.now().Add(stateLifetime), s.server()); err != nil {
		return "", fmt.Errorf("save sign-in state: %w", err)
	}
	return state, nil
}

func (s *Service) TakeState(ctx context.Context, provider, state string) (string, string, error) {
	var verifier string
	var link *string
	err := s.Pool.QueryRow(ctx, `DELETE FROM accounts.oauth_states WHERE state_hash=$1 AND provider=$2 AND expires_at>$3 AND server_id=$4 RETURNING verifier,link_user_id::text`, hashToken(state), provider, s.now(), s.server()).Scan(&verifier, &link)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrInvalidState
	}
	if err != nil {
		return "", "", fmt.Errorf("read sign-in state: %w", err)
	}
	if link == nil {
		return verifier, "", nil
	}
	return verifier, *link, nil
}

func (s *Service) FindIdentity(ctx context.Context, provider, subject string) (User, error) {
	var user User
	err := s.Pool.QueryRow(ctx, `SELECT u.user_id::text,u.display_name FROM accounts.identities i JOIN accounts.users u USING(user_id) WHERE i.provider=$1 AND i.subject=$2 AND i.server_id=$3`, provider, subject, s.server()).Scan(&user.ID, &user.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNoIdentity
	}
	if err != nil {
		return User{}, fmt.Errorf("look up identity: %w", err)
	}
	return user, nil
}

func (s *Service) User(ctx context.Context, userID string) (User, error) {
	var user User
	if err := s.Pool.QueryRow(ctx, `SELECT user_id::text,display_name FROM accounts.users WHERE user_id::text=$1 AND server_id=$2`, userID, s.server()).Scan(&user.ID, &user.DisplayName); err != nil {
		return User{}, fmt.Errorf("find account: %w", err)
	}
	return user, nil
}

func (s *Service) Account(ctx context.Context, userID string) (User, bool, error) {
	var user User
	var admin bool
	err := s.Pool.QueryRow(ctx, `SELECT u.user_id::text,u.display_name,a.user_id IS NOT NULL FROM accounts.users u LEFT JOIN accounts.administrators a USING(user_id) WHERE u.user_id::text=$1 AND u.server_id=$2`, userID, s.server()).Scan(&user.ID, &user.DisplayName, &admin)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, ErrNoAccount
	}
	if err != nil {
		return User{}, false, fmt.Errorf("find account: %w", err)
	}
	return user, admin, nil
}

func (s *Service) Admins(ctx context.Context) ([]User, error) {
	rows, err := s.Pool.Query(ctx, `SELECT u.user_id::text,u.display_name FROM accounts.administrators a JOIN accounts.users u USING(user_id) WHERE u.server_id=$1 ORDER BY a.granted_at,u.user_id`, s.server())
	if err != nil {
		return nil, fmt.Errorf("list administrators: %w", err)
	}
	defer rows.Close()
	admins := []User{}
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.DisplayName); err != nil {
			return nil, fmt.Errorf("read administrator: %w", err)
		}
		admins = append(admins, user)
	}
	return admins, rows.Err()
}

func (s *Service) SetAdmin(ctx context.Context, userID string, admin bool) error {
	if _, _, err := s.Account(ctx, userID); err != nil {
		return err
	}
	statement := `DELETE FROM accounts.administrators a USING accounts.users u WHERE a.user_id=u.user_id AND a.user_id::text=$1 AND u.server_id=$2`
	if admin {
		statement = `INSERT INTO accounts.administrators(user_id) SELECT user_id FROM accounts.users WHERE user_id::text=$1 AND server_id=$2 ON CONFLICT DO NOTHING`
	}
	if _, err := s.Pool.Exec(ctx, statement, userID, s.server()); err != nil {
		return fmt.Errorf("set administrator: %w", err)
	}
	return nil
}

func (s *Service) IdentityLogin(ctx context.Context, provider string, profile Profile, linkUserID string) (User, error) {
	tx, err := database.BeginSerializable(ctx, s.Pool)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(context.Background())
	var user User
	err = tx.QueryRow(ctx, `SELECT u.user_id::text,u.display_name FROM accounts.identities i JOIN accounts.users u USING(user_id) WHERE i.provider=$1 AND i.subject=$2 AND i.server_id=$3`, provider, profile.Subject, s.server()).Scan(&user.ID, &user.DisplayName)
	switch {
	case err == nil:
		if linkUserID != "" && linkUserID != user.ID {
			return User{}, ErrIdentityLinked
		}
	case errors.Is(err, pgx.ErrNoRows):
		if linkUserID != "" {
			if err := tx.QueryRow(ctx, `SELECT user_id::text,display_name FROM accounts.users WHERE user_id::text=$1 AND server_id=$2`, linkUserID, s.server()).Scan(&user.ID, &user.DisplayName); err != nil {
				return User{}, fmt.Errorf("find account to link: %w", err)
			}
		} else {
			display, err := cleanDisplayName(profile.Name, provider+" user")
			if err != nil {
				return User{}, err
			}
			user.DisplayName = display
			if err := tx.QueryRow(ctx, `INSERT INTO accounts.users(display_name,server_id) VALUES($1,$2) RETURNING user_id::text`, display, s.server()).Scan(&user.ID); err != nil {
				return User{}, fmt.Errorf("create account: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO accounts.identities(provider,subject,user_id,server_id) VALUES($1,$2,$3,$4)`, provider, profile.Subject, user.ID, s.server()); err != nil {
			return User{}, fmt.Errorf("link identity: %w", err)
		}
	default:
		return User{}, fmt.Errorf("look up identity: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, fmt.Errorf("commit identity: %w", err)
	}
	return user, nil
}
