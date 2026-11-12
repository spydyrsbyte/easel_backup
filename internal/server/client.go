package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"easel/internal/accounts"
	"easel/internal/files"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/security"
	"easel/internal/session"
	"github.com/gorilla/websocket"
)

type ClientGame struct {
	ID        string
	Runtime   session.ClientRuntime
	Access    func(context.Context, accounts.User) error
	Departure func(userID string) (<-chan struct{}, func())
	Files     *files.Store
	plans     map[string]manifest.Delivery
}

func NewClientGame(runtime session.ClientRuntime, access func(context.Context, accounts.User) error) (*ClientGame, error) {
	if runtime == nil || access == nil {
		return nil, fmt.Errorf("client game requires runtime and access authorization")
	}
	g := &ClientGame{Runtime: runtime, Access: access, plans: map[string]manifest.Delivery{}}
	for _, kind := range runtime.ClientPlan().Clients {
		d, err := runtime.ClientPlan().Delivery(kind)
		if err != nil {
			return nil, err
		}
		g.plans[kind] = d
	}
	return g, nil
}

type protocolVersion struct {
	Major int `json:"major"`
	Minor int `json:"minor"`
}
type clientFrame struct {
	Type     string           `json:"type"`
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	Payload  json.RawMessage  `json:"payload"`
	Names    []string         `json:"names"`
	Protocol *protocolVersion `json:"protocol"`
	Token    string           `json:"token"`
}

type socketOutput struct {
	value   any
	written chan struct{}
}

func parseFrame(data []byte) (clientFrame, error) {
	var f clientFrame
	var raw map[string]json.RawMessage
	if !utf8.Valid(data) || json.Unmarshal(data, &raw) != nil || raw == nil {
		return f, fmt.Errorf("invalid envelope")
	}
	if err := json.Unmarshal(data, &f); err != nil {
		return f, err
	}
	for _, key := range []string{"names", "protocol"} {
		if value, ok := raw[key]; ok && string(value) == "null" {
			return f, fmt.Errorf("invalid %s", key)
		}
	}
	for _, key := range []string{"type", "id", "replyTo", "name", "code", "message", "client", "token"} {
		if value, ok := raw[key]; ok {
			var s string
			if string(value) == "null" || json.Unmarshal(value, &s) != nil {
				return f, fmt.Errorf("invalid %s", key)
			}
		}
	}
	for _, key := range []string{"origin", "principal", "identity", "requestor"} {
		if _, ok := raw[key]; ok {
			return f, fmt.Errorf("untrusted identity field")
		}
	}
	if f.Type == "" || f.ID == "" || len(f.ID) > 256 {
		return f, fmt.Errorf("type and id are required")
	}
	switch f.Type {
	case "hello":
		if f.Protocol == nil || f.Protocol.Major < 0 || f.Protocol.Minor < 0 {
			return f, fmt.Errorf("invalid protocol version")
		}
		var v map[string]json.RawMessage
		_ = json.Unmarshal(raw["protocol"], &v)
		if v["major"] == nil || v["minor"] == nil || string(v["major"]) == "null" || string(v["minor"]) == "null" {
			return f, fmt.Errorf("missing version")
		}
	case "event":
		if f.Name == "" || f.Payload == nil {
			return f, fmt.Errorf("missing event data")
		}
	case "auth.signin", "auth.signup", "auth.response":
		if f.Payload == nil || !bytes.HasPrefix(bytes.TrimSpace(f.Payload), []byte("{")) {
			return f, fmt.Errorf("missing sign-in data")
		}
	case "subscribe", "unsubscribe":
		if f.Names == nil || len(f.Names) > 128 {
			return f, fmt.Errorf("invalid names")
		}
		for _, n := range f.Names {
			if n == "" {
				return f, fmt.Errorf("empty event name")
			}
		}
	case "ready", "leave", "auth.signout":
	default:
		return f, fmt.Errorf("unknown message type")
	}
	return f, nil
}

func decodePayload(payload json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("%w: invalid sign-in data", accounts.ErrInvalidInput)
	}
	return nil
}

func (h *handler) clientAsset(w http.ResponseWriter, r *http.Request) {
	user, err := h.currentUser(r)
	if err != nil {
		h.fail(w, r, http.StatusUnauthorized, "authentication required", err)
		return
	}
	if h.config.Router == nil {
		http.NotFound(w, r)
		return
	}
	var resource manifest.ClientResource
	found := false
	for _, game := range h.config.Router.GamesFor(r.Context(), user) {
		if resource, found = game.plans["http"].Resources[r.URL.Path]; found {
			break
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("ETag", `"`+resource.Hash+`"`)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.HasSuffix(r.URL.Path, ".mjs") {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	}
	http.ServeContent(w, r, path.Base(r.URL.Path), time.Time{}, bytes.NewReader(resource.Data))
}

func errorCode(err error) string {
	if errors.Is(err, security.ErrDenied) {
		return "event.denied"
	}
	s := err.Error()
	if strings.Contains(s, "unknown event") {
		return "event.unknown"
	}
	if strings.Contains(s, "rejects origin") || strings.Contains(s, "authorization denied") {
		return "event.denied"
	}
	return "event.invalid"
}

func (h *handler) clientSocket(w http.ResponseWriter, r *http.Request) {
	if !websocket.IsWebSocketUpgrade(r) {
		h.fail(w, r, http.StatusUpgradeRequired, "WebSocket upgrade required", nil)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != h.origin {
		h.fail(w, r, http.StatusForbidden, "cross-site request rejected", nil)
		return
	}
	client := r.PathValue("type")
	if client == "http" && r.Header.Get("Origin") == "" {
		h.fail(w, r, http.StatusForbidden, "browser origin required", nil)
		return
	}
	if h.config.Router == nil {
		h.fail(w, r, http.StatusServiceUnavailable, "no games are available", nil)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }, HandshakeTimeout: 10 * time.Second}
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer c.Close()
	c.SetReadLimit(1 << 20)
	_ = c.SetReadDeadline(time.Now().Add(30 * time.Second))
	connCtx, cancel := context.WithCancel(r.Context())
	defer cancel()
	ctx := connCtx
	out := make(chan socketOutput, 128)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-connCtx.Done():
				return
			case value := <-out:
				_ = c.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if c.WriteJSON(value.value) != nil {
					_ = c.Close()
					return
				}
				if value.written != nil {
					close(value.written)
				}
			case <-ticker.C:
				if c.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)) != nil {
					_ = c.Close()
					return
				}
			}
		}
	}()
	defer func() { cancel(); <-writerDone }()
	send := func(v any) bool {
		written := make(chan struct{})
		select {
		case out <- socketOutput{v, written}:
		case <-writerDone:
			return false
		case <-connCtx.Done():
			return false
		}
		select {
		case <-written:
			return true
		case <-writerDone:
			return false
		case <-connCtx.Done():
			return false
		}
	}
	fail := func(id, code string) {
		send(map[string]any{"type": "error", "replyTo": id, "code": code, "message": strings.ReplaceAll(code, ".", ": ")})
	}
	var user accounts.User
	var game, joining *ClientGame
	var connection *jsapi.Connection
	server := h.config.Router.Server()
	token, hello, challengeToken := "", "", ""
	negotiated, signedIn := false, false
	var ready atomic.Bool
	subs := map[string]func(){}
	stopWatching := func() {}
	defer func() {
		for _, off := range subs {
			off()
		}
		stopWatching()
	}()
	sessionActive := func() bool {
		_, err := h.config.Accounts.SessionUser(connCtx, token)
		return err == nil
	}
	report := func(err error) {
		if h.config.ReportError != nil {
			h.config.ReportError(r, err)
		}
	}
	serves := func(level *ClientGame) bool {
		if level == nil {
			return false
		}
		_, supported := level.plans[client]
		return supported
	}
	dispatch := func(run func(context.Context) error) (*ClientGame, error) {
		connection.Joined, joining = "", nil
		err := run(jsapi.WithConnection(ctx, connection))
		moved := joining
		connection.Joined, joining = "", nil
		if err != nil {
			return nil, err
		}
		return moved, nil
	}
	enter := func(level *ClientGame, replyTo string) bool {
		plan, supported := level.plans[client]
		if !supported {
			fail(replyTo, "client.unsupported")
			return false
		}
		if err := level.Access(ctx, user); err != nil {
			fail(replyTo, "event.denied")
			return false
		}
		for name, off := range subs {
			off()
			delete(subs, name)
		}
		stopWatching()
		stopWatching = func() {}
		ready.Store(false)
		game = level
		if level.Departure != nil {
			departed, forget := level.Departure(user.ID)
			left := make(chan struct{})
			stopWatching = func() { close(left) }
			go func() {
				defer forget()
				select {
				case <-departed:
					_ = c.Close()
				case <-left:
				case <-connCtx.Done():
				}
			}()
		}
		return send(struct {
			Type     string          `json:"type"`
			ReplyTo  string          `json:"replyTo,omitempty"`
			Protocol protocolVersion `json:"protocol"`
			Client   string          `json:"client"`
			Game     string          `json:"game,omitempty"`
			manifest.Delivery
		}{"welcome", replyTo, protocolVersion{1, 0}, client, level.ID, plan})
	}
	admit := func() bool {
		ctx = security.WithPrincipal(connCtx, user.ID)
		signedIn = true
		_ = c.SetReadDeadline(time.Now().Add(2 * time.Minute))
		c.SetPongHandler(func(string) error { return c.SetReadDeadline(time.Now().Add(2 * time.Minute)) })
		connection = &jsapi.Connection{
			User:   userFields(user),
			Client: client,
			Join: func(id string) error {
				joined, err := h.config.Router.Join(connCtx, user, id)
				if err != nil {
					return err
				}
				joining = joined
				return nil
			},
			Send: func(name string, payload json.RawMessage) error {
				select {
				case out <- socketOutput{value: map[string]any{"type": "event", "name": name, "payload": payload}}:
					return nil
				default:
					_ = c.Close()
					return errors.New("connection is not keeping up with its events")
				}
			},
		}
		routed, err := dispatch(func(ctx context.Context) error { return h.config.Router.Connect(ctx, "signedIn", connection) })
		if err != nil {
			report(err)
			fail(hello, "game.unavailable")
			return true
		}
		if routed == nil {
			if !serves(server) {
				fail(hello, "game.none")
				return true
			}
			routed = server
		}
		return enter(routed, hello)
	}
	sendRefusal := func(id, reason string) {
		send(map[string]any{"type": "auth.refused", "replyTo": id, "reason": reason})
	}
	authenticate := func(f clientFrame) bool {
		var result AuthResult
		var err error
		switch f.Type {
		case "auth.signin":
			var body struct {
				Method   string `json:"method"`
				Username string `json:"username"`
				Password string `json:"password"`
				Provider string `json:"provider"`
				Code     string `json:"code"`
				Verifier string `json:"verifier"`
				Redirect string `json:"redirect"`
			}
			if err = decodePayload(f.Payload, &body); err == nil {
				result, err = h.auth.SignIn(connCtx, SignIn{Method: body.Method, Username: body.Username, Password: body.Password, Provider: body.Provider, Code: body.Code, Verifier: body.Verifier, Redirect: body.Redirect, Client: client, Address: clientAddress(r)})
			}
		case "auth.signup":
			var body struct {
				Username    string `json:"username"`
				Password    string `json:"password"`
				DisplayName string `json:"displayName"`
			}
			if err = decodePayload(f.Payload, &body); err == nil {
				result, err = h.auth.SignUp(connCtx, SignIn{Username: body.Username, Password: body.Password, DisplayName: body.DisplayName, Client: client, Address: clientAddress(r)})
			}
		case "auth.response":
			var body struct {
				Response any `json:"response"`
			}
			if err = decodePayload(f.Payload, &body); err == nil {
				result, err = h.auth.Respond(connCtx, challengeToken, body.Response)
				challengeToken = ""
			}
		default:
			fail(f.ID, "auth.required")
			return false
		}
		switch {
		case err != nil:
			status, message := authError(err)
			if status >= http.StatusInternalServerError && h.config.ReportError != nil {
				h.config.ReportError(r, err)
			}
			sendRefusal(f.ID, message)
		case result.Refused != "":
			sendRefusal(f.ID, result.Refused)
		case result.Challenge != "":
			challengeToken = result.ChallengeToken
			send(map[string]any{"type": "auth.challenge", "replyTo": f.ID, "challenge": result.Challenge})
		default:
			token, user = result.Token, result.User
			if !send(map[string]any{"type": "auth.session", "replyTo": f.ID, "token": result.Token, "expires": result.Expires, "user": result.User}) {
				return false
			}
			return admit()
		}
		return true
	}
	for {
		kind, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		if kind != websocket.TextMessage {
			fail("", "protocol.invalid")
			return
		}
		f, err := parseFrame(data)
		if err != nil {
			fail(f.ID, "protocol.invalid")
			return
		}
		if !negotiated {
			if f.Type != "hello" {
				fail(f.ID, "protocol.invalid")
				return
			}
			if f.Protocol.Major != 1 {
				fail(f.ID, "protocol.unsupported")
				return
			}
			hello, negotiated = f.ID, true
			_ = c.SetReadDeadline(time.Now().Add(challengeLifetime))
			token = f.Token
			if token == "" && client == "http" {
				token = sessionToken(r)
			}
			if token != "" {
				user, err = h.config.Accounts.SessionUser(connCtx, token)
				if err == nil {
					if !admit() {
						return
					}
					continue
				}
				if !errors.Is(err, accounts.ErrNoSession) {
					if h.config.ReportError != nil {
						h.config.ReportError(r, err)
					}
					fail(f.ID, "internal.error")
					return
				}
				token = ""
			}
			required := map[string]any{"type": "auth.required", "replyTo": f.ID}
			for key, value := range h.auth.Methods() {
				required[key] = value
			}
			send(required)
			continue
		}
		if !signedIn {
			if !authenticate(f) {
				return
			}
			continue
		}
		if !sessionActive() {
			fail(f.ID, "auth.required")
			return
		}
		if f.Type == "auth.signout" {
			if err := h.config.Accounts.EndSession(connCtx, token); err != nil && h.config.ReportError != nil {
				h.config.ReportError(r, err)
			}
			return
		}
		if f.Type == "leave" {
			if game == nil || game == server || !serves(server) {
				fail(f.ID, "game.none")
				continue
			}
			if !enter(server, f.ID) {
				return
			}
			continue
		}
		if game == nil {
			fail(f.ID, "game.none")
			continue
		}
		if err = game.Access(ctx, user); err != nil {
			fail(f.ID, "event.denied")
			return
		}
		switch f.Type {
		case "ready":
			if ready.Load() {
				fail(f.ID, "protocol.invalid")
				return
			}
			send(map[string]string{"type": "ready.ok", "replyTo": f.ID})
			ready.Store(true)
			if game != server {
				continue
			}
			moved, err := dispatch(func(ctx context.Context) error { return h.config.Router.Connect(ctx, "ready", connection) })
			if err != nil {
				report(err)
				continue
			}
			if moved != nil && !enter(moved, "") {
				return
			}
		case "event":
			if !ready.Load() {
				fail(f.ID, "protocol.invalid")
				return
			}
			var moved *ClientGame
			if game == server {
				moved, err = dispatch(func(ctx context.Context) error { return game.Runtime.EmitAuthorizedClient(ctx, f.Name, f.Payload) })
			} else {
				err = game.Runtime.EmitAuthorizedClient(jsapi.WithConnection(ctx, connection), f.Name, f.Payload)
			}
			if err != nil {
				report(err)
				fail(f.ID, errorCode(err))
				continue
			}
			send(map[string]string{"type": "event.ack", "replyTo": f.ID})
			if moved != nil && !enter(moved, "") {
				return
			}
		case "subscribe", "unsubscribe":
			accepted, rejected := []string{}, []string{}
			for _, name := range f.Names {
				if f.Type == "unsubscribe" {
					if off := subs[name]; off != nil {
						off()
						delete(subs, name)
					}
					accepted = append(accepted, name)
					continue
				}
				if subs[name] != nil {
					accepted = append(accepted, name)
					continue
				}
				if len(subs) >= 128 {
					rejected = append(rejected, name)
					continue
				}
				level := game
				off, err := level.Runtime.SubscribeClient(ctx, name, func(payload json.RawMessage) {
					if !ready.Load() || !sessionActive() {
						return
					}
					if level.Access(ctx, user) != nil {
						return
					}
					select {
					case out <- socketOutput{value: map[string]any{"type": "event", "name": name, "payload": payload}}:
					default:
						_ = c.Close()
					}
				})
				if err != nil {
					rejected = append(rejected, name)
				} else {
					subs[name] = off
					accepted = append(accepted, name)
				}
			}
			send(map[string]any{"type": "subscription.ack", "replyTo": f.ID, "accepted": accepted, "rejected": rejected})
		default:
			fail(f.ID, "protocol.invalid")
			return
		}
	}
}
