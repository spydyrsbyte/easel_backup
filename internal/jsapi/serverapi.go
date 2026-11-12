package jsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"easel/internal/events"
	"github.com/grafana/sobek"
)

const (
	AuthAllow     = "allow"
	AuthRefuse    = "refuse"
	AuthChallenge = "challenge"
)

var (
	authHookNames       = map[string]bool{"signIn": true, "signUp": true, "response": true, "signedIn": true}
	connectionHookNames = map[string]bool{"signedIn": true, "ready": true}
)

type AuthDecision struct {
	Outcome   string
	Reason    string
	Challenge string
}

type ServerGames interface {
	Create(ctx context.Context, name, application string, modules []string, access string) (any, error)
	List(ctx context.Context) (any, error)
	Get(ctx context.Context, id string) (any, error)
	SetAccess(ctx context.Context, id, access string) error
	Start(ctx context.Context, id string) error
	Stop(id string) error
	Delete(ctx context.Context, id string) error
	AddMember(ctx context.Context, id, userID string) error
	Members(ctx context.Context, id string) (any, error)
	Remove(ctx context.Context, id, userID string) error
	Installed() any
	OnEvent(eventName string, handler func(gameID string, payload json.RawMessage))
	EmitEvent(eventName string, payload json.RawMessage, targetID string) error
}

type ServerUsers interface {
	Get(ctx context.Context, id string) (any, error)
	Admins(ctx context.Context) (any, error)
	SetAdmin(ctx context.Context, id string, admin bool) error
}

type Connection struct {
	User   map[string]any
	Client string
	Join   func(string) error
	Send   func(string, json.RawMessage) error
	Joined string
}

type connectionKey struct{}

func WithConnection(ctx context.Context, connection *Connection) context.Context {
	return context.WithValue(ctx, connectionKey{}, connection)
}

func ConnectionFrom(ctx context.Context) *Connection {
	connection, _ := ctx.Value(connectionKey{}).(*Connection)
	return connection
}

func (bridge *EventBridge) InstallServerAPI(games ServerGames, users ServerUsers) error {
	bridge.authHooks = map[string][]sobek.Callable{}
	bridge.connectionHooks = map[string][]sobek.Callable{}
	bridge.games = games
	bridge.users = users
	server := bridge.vm.Get("Server").ToObject(bridge.vm)
	install := func(name string, methods map[string]func(sobek.FunctionCall) sobek.Value) error {
		object := bridge.vm.NewObject()
		for method, implementation := range methods {
			if err := object.DefineDataProperty(method, bridge.vm.ToValue(implementation), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
				return err
			}
		}
		return server.DefineDataProperty(name, object, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
	}
	if err := install("auth", map[string]func(sobek.FunctionCall) sobek.Value{"on": bridge.onAuth}); err != nil {
		return err
	}
	if err := install("connections", map[string]func(sobek.FunctionCall) sobek.Value{"on": bridge.onConnection}); err != nil {
		return err
	}
	if users != nil {
		if err := install("users", map[string]func(sobek.FunctionCall) sobek.Value{"get": bridge.getUser, "list": bridge.listUsers, "admins": bridge.listAdmins, "setAdmin": bridge.setAdmin}); err != nil {
			return err
		}
	}
	if games == nil {
		return nil
	}
	gamesObject := bridge.vm.NewObject()
	methods := map[string]func(sobek.FunctionCall) sobek.Value{
		"create": bridge.createGame, "list": bridge.listGames, "get": bridge.getGame, "setAccess": bridge.setGameAccess,
		"start": bridge.startGame, "stop": bridge.stopGame, "delete": bridge.deleteGame, "addMember": bridge.addGameMember, "members": bridge.gameMembers, "remove": bridge.removeFromGame,
		"installed": bridge.installedPackages,
		"roles":     bridge.gameRoles, "setRole": bridge.setGameRole,
		"setModules": bridge.setGameModules,
		"on":         bridge.onGameServerEvent,
		"emit":       bridge.emitToGameFromGames,
	}
	for method, implementation := range methods {
		if err := gamesObject.DefineDataProperty(method, bridge.vm.ToValue(implementation), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	if err := server.DefineDataProperty("games", gamesObject, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return err
	}
	if err := install("packages", map[string]func(sobek.FunctionCall) sobek.Value{"list": bridge.listPackages, "refresh": bridge.refreshPackages, "updates": bridge.packageUpdates, "update": bridge.updatePackage}); err != nil {
		return err
	}
	return bridge.vm.GlobalObject().DefineDataProperty("Games", gamesObject, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

func (bridge *EventBridge) onGameServerEvent(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	handler, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("game event handler must be a function"))
	}
	if bridge.serverGameListeners == nil {
		bridge.serverGameListeners = make(map[string][]sobek.Callable)
	}
	isFirst := len(bridge.serverGameListeners[name]) == 0
	bridge.serverGameListeners[name] = append(bridge.serverGameListeners[name], handler)
	if bridge.games != nil && isFirst {
		bridge.games.OnEvent(name, func(gameID string, payload json.RawMessage) {
			payloadCopy := append(json.RawMessage(nil), payload...)
			if bridge.submit != nil {
				go func() {
					_, _ = bridge.submit(context.Background(), events.Server, "easel.easel.server", func() (json.RawMessage, error) {
						var val sobek.Value = sobek.Undefined()
						if len(payloadCopy) > 0 {
							parsed, err := bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(payloadCopy)))
							if err == nil {
								val = parsed
							}
						}
						idVal := bridge.vm.ToValue(gameID)
						for _, listener := range bridge.serverGameListeners[name] {
							_, _ = listener(sobek.Undefined(), idVal, val)
						}
						return nil, nil
					})
				}()
			}
		})
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) emitToGameFromGames(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	var payload json.RawMessage
	if len(call.Arguments) > 1 && !sobek.IsUndefined(call.Argument(1)) {
		payload = bridge.encode(call.Argument(1))
	} else {
		payload = json.RawMessage(`{}`)
	}
	var targetID string
	if len(call.Arguments) > 2 && !sobek.IsUndefined(call.Argument(2)) && !sobek.IsNull(call.Argument(2)) {
		targetID = call.Argument(2).String()
	}
	if bridge.games == nil {
		bridge.fail(fmt.Errorf("games management is unsupported"))
	}
	if err := bridge.games.EmitEvent(name, payload, targetID); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) listUsers(sobek.FunctionCall) sobek.Value {
	lister, ok := bridge.users.(interface {
		List(context.Context) (any, error)
	})
	if !ok {
		bridge.fail(fmt.Errorf("user listing is unsupported"))
	}
	return bridge.plain(lister.List(bridge.ctx))
}

type packagedGames interface {
	SetModules(context.Context, string, []string) error
	RefreshPackages(context.Context) (any, error)
	InstalledPackages(context.Context) (any, error)
	PackageUpdates(context.Context) (any, error)
	UpdatePackage(context.Context, string) (any, error)
}

func (bridge *EventBridge) packaged() packagedGames {
	manager, ok := bridge.games.(packagedGames)
	if !ok {
		bridge.fail(fmt.Errorf("package management is unsupported"))
	}
	return manager
}

func (bridge *EventBridge) setGameModules(call sobek.FunctionCall) sobek.Value {
	var modules []string
	if err := json.Unmarshal(bridge.encode(call.Argument(1)), &modules); err != nil {
		bridge.fail(fmt.Errorf("Server.games.setModules takes a game id and a list of module ids"))
	}
	return bridge.done(bridge.packaged().SetModules(bridge.ctx, bridge.text(call.Argument(0), "game id"), modules))
}

func (bridge *EventBridge) listPackages(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.packaged().InstalledPackages(bridge.ctx))
}

func (bridge *EventBridge) refreshPackages(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.packaged().RefreshPackages(bridge.ctx))
}

func (bridge *EventBridge) packageUpdates(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.packaged().PackageUpdates(bridge.ctx))
}

func (bridge *EventBridge) updatePackage(call sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.packaged().UpdatePackage(bridge.ctx, bridge.text(call.Argument(0), "package id")))
}

type managedGames interface {
	Roles(context.Context, string) (any, error)
	SetRole(context.Context, string, string, string) error
}

func (bridge *EventBridge) gameRoles(call sobek.FunctionCall) sobek.Value {
	manager, ok := bridge.games.(managedGames)
	if !ok {
		bridge.fail(fmt.Errorf("game roles are unsupported"))
	}
	return bridge.plain(manager.Roles(bridge.ctx, bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) setGameRole(call sobek.FunctionCall) sobek.Value {
	manager, ok := bridge.games.(managedGames)
	if !ok {
		bridge.fail(fmt.Errorf("game roles are unsupported"))
	}
	return bridge.done(manager.SetRole(bridge.ctx, bridge.text(call.Argument(0), "game id"), bridge.text(call.Argument(1), "user id"), bridge.text(call.Argument(2), "role")))
}

func (bridge *EventBridge) text(value sobek.Value, what string) string {
	text, ok := value.Export().(string)
	if !ok || text == "" {
		bridge.fail(fmt.Errorf("%s must be a non-empty string", what))
	}
	return text
}

func (bridge *EventBridge) plain(value any, err error) sobek.Value {
	if err != nil {
		bridge.fail(err)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		bridge.fail(err)
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		bridge.fail(err)
	}
	return bridge.vm.ToValue(decoded)
}

func (bridge *EventBridge) done(err error) sobek.Value {
	if err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) createGame(call sobek.FunctionCall) sobek.Value {
	var settings struct {
		Name        string   `json:"name"`
		Application string   `json:"application"`
		Modules     []string `json:"modules"`
		Access      string   `json:"access"`
	}
	encoded, err := json.Marshal(call.Argument(0).Export())
	if err == nil {
		decoder := json.NewDecoder(bytes.NewReader(encoded))
		decoder.DisallowUnknownFields()
		err = decoder.Decode(&settings)
	}
	if err != nil {
		bridge.fail(fmt.Errorf("Server.games.create takes {name, application, modules, access}: %w", err))
	}
	return bridge.plain(bridge.games.Create(bridge.ctx, settings.Name, settings.Application, settings.Modules, settings.Access))
}

func (bridge *EventBridge) listGames(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.games.List(bridge.ctx))
}

func (bridge *EventBridge) getGame(call sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.games.Get(bridge.ctx, bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) setGameAccess(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.SetAccess(bridge.ctx, bridge.text(call.Argument(0), "game id"), bridge.text(call.Argument(1), "access")))
}

func (bridge *EventBridge) startGame(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.Start(bridge.ctx, bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) stopGame(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.Stop(bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) deleteGame(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.Delete(bridge.ctx, bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) addGameMember(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.AddMember(bridge.ctx, bridge.text(call.Argument(0), "game id"), bridge.text(call.Argument(1), "user id")))
}

func (bridge *EventBridge) gameMembers(call sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.games.Members(bridge.ctx, bridge.text(call.Argument(0), "game id")))
}

func (bridge *EventBridge) removeFromGame(call sobek.FunctionCall) sobek.Value {
	return bridge.done(bridge.games.Remove(bridge.ctx, bridge.text(call.Argument(0), "game id"), bridge.text(call.Argument(1), "user id")))
}

func (bridge *EventBridge) installedPackages(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.games.Installed(), nil)
}

func (bridge *EventBridge) getUser(call sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.users.Get(bridge.ctx, bridge.text(call.Argument(0), "user id")))
}

func (bridge *EventBridge) listAdmins(sobek.FunctionCall) sobek.Value {
	return bridge.plain(bridge.users.Admins(bridge.ctx))
}

func (bridge *EventBridge) setAdmin(call sobek.FunctionCall) sobek.Value {
	admin, ok := call.Argument(1).Export().(bool)
	if !ok {
		bridge.fail(fmt.Errorf("Server.users.setAdmin takes a user id and true or false"))
	}
	return bridge.done(bridge.users.SetAdmin(bridge.ctx, bridge.text(call.Argument(0), "user id"), admin))
}

func (bridge *EventBridge) onConnection(call sobek.FunctionCall) sobek.Value {
	name := bridge.text(call.Argument(0), "connection event")
	if !connectionHookNames[name] {
		bridge.fail(fmt.Errorf("unknown connection event %q", name))
	}
	hook, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("connection hook must be a function"))
	}
	bridge.connectionHooks[name] = append(bridge.connectionHooks[name], hook)
	return sobek.Undefined()
}

func (bridge *EventBridge) connectionObject(connection *Connection) *sobek.Object {
	object := bridge.vm.NewObject()
	_ = object.Set("user", connection.User)
	_ = object.Set("client", connection.Client)
	_ = object.Set("join", func(call sobek.FunctionCall) sobek.Value {
		id := bridge.text(call.Argument(0), "game id")
		if connection.Joined != "" {
			bridge.fail(fmt.Errorf("connection already joined game %s", connection.Joined))
		}
		if connection.Join == nil {
			bridge.fail(fmt.Errorf("this connection cannot join a game now"))
		}
		if err := connection.Join(id); err != nil {
			bridge.fail(err)
		}
		connection.Joined = id
		return sobek.Undefined()
	})
	_ = object.Set("send", func(call sobek.FunctionCall) sobek.Value {
		name := bridge.text(call.Argument(0), "event name")
		payload := bridge.encode(call.Argument(1))
		if connection.Send == nil {
			bridge.fail(fmt.Errorf("this connection cannot receive events yet"))
		}
		if err := bridge.engine.Check(bridge.ctx, events.Server, name, payload); err != nil {
			bridge.fail(err)
		}
		bridge.DeliverAfterCommit(func() error { return connection.Send(name, payload) })
		return sobek.Undefined()
	})
	return object
}

func (bridge *EventBridge) Connect(ctx context.Context, event string, connection *Connection) error {
	if !connectionHookNames[event] {
		return fmt.Errorf("unknown connection event %q", event)
	}
	object := bridge.connectionObject(connection)
	for _, hook := range bridge.connectionHooks[event] {
		err := bridge.Within(ctx, bridge.origin, "easel.easel.server", func() error {
			_, err := hook(sobek.Undefined(), object)
			return err
		})
		if err != nil {
			return fmt.Errorf("connection hook %s: %w", event, err)
		}
		if connection.Joined != "" {
			break
		}
	}
	return nil
}

func (bridge *EventBridge) onAuth(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	if !authHookNames[name] {
		bridge.fail(fmt.Errorf("unknown sign-in hook %q", name))
	}
	hook, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("sign-in hook %s must be a function", name))
	}
	bridge.authHooks[name] = append(bridge.authHooks[name], hook)
	return sobek.Undefined()
}

func (bridge *EventBridge) Evaluate(ctx context.Context, hook string, fields map[string]any) (AuthDecision, error) {
	if !authHookNames[hook] {
		return AuthDecision{}, fmt.Errorf("unknown sign-in hook %q", hook)
	}
	object := bridge.vm.NewObject()
	for key, value := range fields {
		if err := object.Set(key, value); err != nil {
			return AuthDecision{}, err
		}
	}
	decision := func(outcome string) func(sobek.FunctionCall) sobek.Value {
		return func(call sobek.FunctionCall) sobek.Value {
			result := bridge.vm.NewObject()
			_ = result.Set("outcome", outcome)
			if outcome == AuthRefuse && !sobek.IsUndefined(call.Argument(0)) {
				_ = result.Set("reason", call.Argument(0).String())
			}
			if outcome == AuthChallenge {
				_ = result.Set("challenge", bridge.name(call.Argument(0)))
			}
			return result
		}
	}
	for name, outcome := range map[string]string{"allow": AuthAllow, "refuse": AuthRefuse, "challenge": AuthChallenge} {
		if err := object.Set(name, decision(outcome)); err != nil {
			return AuthDecision{}, err
		}
	}
	for _, callback := range bridge.authHooks[hook] {
		var returned sobek.Value
		err := bridge.Within(ctx, bridge.origin, "easel.easel.server", func() error {
			var err error
			returned, err = callback(sobek.Undefined(), object)
			return err
		})
		if err != nil {
			return AuthDecision{}, fmt.Errorf("sign-in hook %s: %w", hook, err)
		}
		if returned == nil || sobek.IsUndefined(returned) || sobek.IsNull(returned) {
			continue
		}
		result := returned.ToObject(bridge.vm)
		outcome := result.Get("outcome")
		if outcome == nil || sobek.IsUndefined(outcome) {
			continue
		}
		found := AuthDecision{Outcome: outcome.String()}
		if reason := result.Get("reason"); reason != nil && !sobek.IsUndefined(reason) {
			found.Reason = reason.String()
		}
		if challenge := result.Get("challenge"); challenge != nil && !sobek.IsUndefined(challenge) {
			found.Challenge = challenge.String()
		}
		switch found.Outcome {
		case AuthAllow, AuthRefuse:
			return found, nil
		case AuthChallenge:
			if found.Challenge == "" {
				return AuthDecision{}, fmt.Errorf("sign-in hook %s issued an unnamed challenge", hook)
			}
			return found, nil
		default:
			return AuthDecision{}, fmt.Errorf("sign-in hook %s returned unknown outcome %q", hook, found.Outcome)
		}
	}
	if hook == "signedIn" {
		return AuthDecision{Outcome: AuthAllow}, nil
	}
	return AuthDecision{Outcome: AuthRefuse, Reason: "sign-in is not allowed"}, nil
}
