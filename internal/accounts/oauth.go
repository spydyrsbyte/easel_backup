package accounts

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"

	"golang.org/x/oauth2"
)

const maxProfileBytes = 1 << 20

type ProviderConfig struct {
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret"`
	AuthURL      string   `json:"auth_url,omitempty"`
	TokenURL     string   `json:"token_url,omitempty"`
	UserInfoURL  string   `json:"userinfo_url,omitempty"`
	Scopes       []string `json:"scopes,omitempty"`
	SubjectField string   `json:"subject_field,omitempty"`
	NameFields   []string `json:"name_fields,omitempty"`
}

type Config struct {
	PublicURL string                    `json:"public_url"`
	Providers map[string]ProviderConfig `json:"providers"`
}

var presets = map[string]ProviderConfig{
	"google": {
		AuthURL:      "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:     "https://oauth2.googleapis.com/token",
		UserInfoURL:  "https://openidconnect.googleapis.com/v1/userinfo",
		Scopes:       []string{"openid", "profile"},
		SubjectField: "sub",
		NameFields:   []string{"name"},
	},
	"discord": {
		AuthURL:      "https://discord.com/oauth2/authorize",
		TokenURL:     "https://discord.com/api/oauth2/token",
		UserInfoURL:  "https://discord.com/api/users/@me",
		Scopes:       []string{"identify"},
		SubjectField: "id",
		NameFields:   []string{"global_name", "username"},
	},
}

var providerName = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

type Profile struct {
	Subject string
	Name    string
}

type Provider struct {
	Name         string
	oauth        oauth2.Config
	userInfo     string
	subjectField string
	nameFields   []string
}

func LoadConfig(path string) (Config, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read sign-in settings %s: %w", path, err)
	}
	var config Config
	if err := json.Unmarshal(contents, &config); err != nil {
		return Config{}, fmt.Errorf("invalid sign-in settings in %s: %w", path, err)
	}
	return config, nil
}

func (c Config) SecureCookies() bool { return strings.HasPrefix(c.PublicURL, "https://") }

func (c Config) Build() (map[string]*Provider, error) {
	public, err := url.Parse(c.PublicURL)
	if err != nil || (public.Scheme != "https" && public.Scheme != "http") || public.Host == "" {
		return nil, fmt.Errorf("public_url %q must be an absolute http or https URL", c.PublicURL)
	}
	providers := map[string]*Provider{}
	for name, settings := range c.Providers {
		if !providerName.MatchString(name) {
			return nil, fmt.Errorf("provider name %q must be lowercase letters, digits, or dashes", name)
		}
		merged := presets[name]
		if settings.AuthURL != "" {
			merged.AuthURL = settings.AuthURL
		}
		if settings.TokenURL != "" {
			merged.TokenURL = settings.TokenURL
		}
		if settings.UserInfoURL != "" {
			merged.UserInfoURL = settings.UserInfoURL
		}
		if len(settings.Scopes) > 0 {
			merged.Scopes = settings.Scopes
		}
		if settings.SubjectField != "" {
			merged.SubjectField = settings.SubjectField
		}
		if len(settings.NameFields) > 0 {
			merged.NameFields = settings.NameFields
		}
		if settings.ClientID == "" || settings.ClientSecret == "" || merged.AuthURL == "" || merged.TokenURL == "" || merged.UserInfoURL == "" || merged.SubjectField == "" {
			return nil, fmt.Errorf("provider %s requires client_id, client_secret, and endpoints", name)
		}
		providers[name] = &Provider{
			Name: name,
			oauth: oauth2.Config{
				ClientID:     settings.ClientID,
				ClientSecret: settings.ClientSecret,
				Endpoint:     oauth2.Endpoint{AuthURL: merged.AuthURL, TokenURL: merged.TokenURL},
				RedirectURL:  strings.TrimRight(c.PublicURL, "/") + "/auth/" + name + "/callback",
				Scopes:       merged.Scopes,
			},
			userInfo:     merged.UserInfoURL,
			subjectField: merged.SubjectField,
			nameFields:   merged.NameFields,
		}
	}
	return providers, nil
}

func NewVerifier() string { return oauth2.GenerateVerifier() }

func (p *Provider) AuthCodeURL(state, verifier string) string {
	return p.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
}

func (p *Provider) Profile(ctx context.Context, code, verifier string) (Profile, error) {
	return p.ProfileFor(ctx, code, verifier, "")
}

func (p *Provider) ProfileFor(ctx context.Context, code, verifier, redirect string) (Profile, error) {
	options := []oauth2.AuthCodeOption{oauth2.VerifierOption(verifier)}
	if redirect != "" {
		options = append(options, oauth2.SetAuthURLParam("redirect_uri", redirect))
	}
	token, err := p.oauth.Exchange(ctx, code, options...)
	if err != nil {
		return Profile{}, fmt.Errorf("%s sign-in: exchange code: %w", p.Name, err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.userInfo, nil)
	if err != nil {
		return Profile{}, fmt.Errorf("%s sign-in: %w", p.Name, err)
	}
	response, err := p.oauth.Client(ctx, token).Do(request)
	if err != nil {
		return Profile{}, fmt.Errorf("%s sign-in: read profile: %w", p.Name, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Profile{}, fmt.Errorf("%s sign-in: profile request returned %s", p.Name, response.Status)
	}
	var fields map[string]any
	if err := json.NewDecoder(io.LimitReader(response.Body, maxProfileBytes)).Decode(&fields); err != nil {
		return Profile{}, fmt.Errorf("%s sign-in: decode profile: %w", p.Name, err)
	}
	subject := ""
	switch value := fields[p.subjectField].(type) {
	case string:
		subject = value
	case float64:
		subject = fmt.Sprintf("%.0f", value)
	}
	if subject == "" {
		return Profile{}, fmt.Errorf("%s sign-in: profile has no %s", p.Name, p.subjectField)
	}
	profile := Profile{Subject: subject}
	for _, field := range p.nameFields {
		if name, ok := fields[field].(string); ok && strings.TrimSpace(name) != "" {
			profile.Name = name
			break
		}
	}
	return profile, nil
}
