package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"easel/internal/automation"
	"easel/internal/events"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
	"github.com/grafana/sobek"
)

var ErrClosed = errors.New("session closed")

type Runtime interface {
	Dispatch(context.Context, json.RawMessage) (json.RawMessage, error)
	EmitServer(context.Context, string, json.RawMessage) error
	EmitClient(context.Context, string, json.RawMessage) error
	EmitAutomation(context.Context, string, json.RawMessage) error
	RunAutomation(context.Context, string, []any) (automation.Result, error)
	AutomationCommand(context.Context, string) (automation.Result, error)
	SaveAutomation(context.Context, automation.Creator, automation.Definition) error
	ListAutomations(context.Context) ([]automation.Saved, error)
	DeleteAutomation(context.Context, string) error
	Warnings() []string
	Close() error
}

type Game struct {
	Schema            *schema.Schema
	Members           func(context.Context) (any, error)
	AuthorizeClient   func(context.Context, string, json.RawMessage, bool) error
	GameID            string
	SessionID         string
	Security          *jsapi.SecurityConfig
	Packages          []manifest.Package
	Globals           []manifest.Package
	Server            bool
	Games             jsapi.ServerGames
	Users             jsapi.ServerUsers
	Automations       []automation.Saved
	AutomationService *automation.Service
	RecordType        func(context.Context, string) (string, error)
	Records           automation.Records
	Debug             bool
	EmitServerEvent   func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error
	Files             *jsapi.FilesConfig
}

type request struct {
	ctx       context.Context
	origin    events.Origin
	owner     string
	operation func() (json.RawMessage, error)
	reply     chan result
}
type result struct {
	data json.RawMessage
	err  error
}

type session struct {
	timerMu         sync.Mutex
	timers          map[int64]*time.Timer
	nextTimer       int64
	plan            manifest.Plan
	authorizeClient func(context.Context, string, json.RawMessage, bool) error
	requests        chan request
	stop            chan struct{}
	done            chan struct{}
	once            sync.Once
	vm              *sobek.Runtime
	engine          *events.Engine
	bridge          *jsapi.EventBridge
	legacyHandler   sobek.Callable
	schema          *schema.Schema
}

func NewGame(ctx context.Context, game Game) (Runtime, error) {
	globals := map[string]bool{}
	listed := map[string]bool{}
	for _, pkg := range game.Packages {
		listed[pkg.ID()] = true
	}
	all := append([]manifest.Package(nil), game.Packages...)
	for _, pkg := range game.Globals {
		if !listed[pkg.ID()] {
			listed[pkg.ID()] = true
			globals[pkg.ID()] = true
			all = append(all, pkg)
		}
		for _, dep := range pkg.Dependencies {
			if !listed[dep.ID()] {
				listed[dep.ID()] = true
				globals[dep.ID()] = true
				all = append(all, dep)
			}
		}
	}
	game.Packages = all
	plan, err := manifest.Resolve(game.Packages)
	if err != nil {
		return nil, fmt.Errorf("resolve packages: %w", err)
	}
	composed := game.Schema
	if composed == nil {
		composed, err = schema.Compose(plan.Packages)
		if err != nil {
			return nil, fmt.Errorf("compose data schema: %w", err)
		}
	}
	game.Packages = append([]manifest.Package(nil), game.Packages...)
	game.Automations = append([]automation.Saved(nil), game.Automations...)
	s := &session{requests: make(chan request), stop: make(chan struct{}), done: make(chan struct{}), schema: composed, plan: plan, authorizeClient: game.AuthorizeClient}
	ready := make(chan error, 1)
	go s.run(ctx, game, plan, globals, ready)
	if err := <-ready; err != nil {
		return nil, err
	}
	return s, nil
}

var loadEvents = []string{
	"Load.Start",
	"Load.Initialize",
	"Load.Data.PreLoad",
	"Load.Data.Ready",
	"Load.Automation.PreLoad",
	"Load.Automation.Ready",
	"Load.Users.PreLoad",
	"Load.Users.Ready",
	"Load.Automation.Users.PreLoad",
	"Load.Automation.Users.Ready",
	"Load.Finish",
}

func (s *session) run(ctx context.Context, game Game, plan manifest.Plan, globals map[string]bool, ready chan<- error) {
	defer close(s.done)
	defer s.stopTimers()
	ctx, err := scope(ctx, game, events.Server)
	if err != nil {
		ready <- err
		return
	}
	service, err := jsapi.BuildSecurity(ctx, game.Security, game.SessionID, plan.Security, s.schema)
	if err != nil {
		ready <- fmt.Errorf("build security: %w", err)
		return
	}
	s.vm = sobek.New()
	s.engine = events.New(schema.EventTypes{Schema: s.schema, Lookup: game.RecordType})
	bridge, err := jsapi.InstallEvents(s.vm, s.engine)
	if err != nil {
		ready <- err
		return
	}
	s.bridge = bridge
	s.bridge.SetSubmit(s.submit)
	s.bridge.SetServerEventEmitter(game.GameID, game.EmitServerEvent)
	if err := s.bridge.InstallGameServices(game.Members, s.schedule, s.cancelTimer); err != nil {
		ready <- err
		return
	}
	if err := s.bridge.InstallSecurity(service); err != nil {
		ready <- err
		return
	}
	if err := s.bridge.InstallAutomations(game.AutomationService); err != nil {
		ready <- err
		return
	}
	if game.Server {
		if err := s.bridge.InstallServerAPI(game.Games, game.Users); err != nil {
			ready <- err
			return
		}
	}
	if err := s.bridge.InstallFiles(game.Files); err != nil {
		ready <- err
		return
	}
	if err := s.bridge.InstallRecords(s.schema, game.Records, game.Debug); err != nil {
		ready <- err
		return
	}
	for _, name := range loadEvents {
		if err := s.engine.Register("easel", name, events.Definition{Valid: events.Server, Fields: map[string]string{}}); err != nil {
			ready <- err
			return
		}
	}
	if err := s.engine.Register("easel", "Users.Changed", events.Definition{Valid: events.Server, Fields: map[string]string{}}); err != nil {
		ready <- err
		return
	}
	err = s.execute(ctx, func() error {
		run := func(entry manifest.Entry, file string) (*sobek.Object, error) {
			var namespace *sobek.Object
			err := s.bridge.Within(ctx, events.Server, entry.Package.ID(), func() error {
				var err error
				namespace, err = s.bridge.RunModule(entry.Package, file)
				return err
			})
			return namespace, err
		}
		for _, pkg := range plan.Packages {
			if pkg.Manifest.Server.Library == nil {
				if err := s.bridge.AddLazyInterfaces(pkg); err != nil {
					return err
				}
			}
		}
		for _, entry := range plan.Library {
			if globals[entry.Package.ID()] {
				if err := s.bridge.AddLazyLibrary(entry.Package, entry.Path); err != nil {
					return err
				}
				continue
			}
			s.bridge.GrantInterfaces(entry.Package)
			if _, err := run(entry, entry.Path); err != nil {
				return err
			}
			if err := s.bridge.AddLazyInterfaces(entry.Package); err != nil {
				return err
			}
		}
		if err := s.bridge.CloseInterfaceRegistration(); err != nil {
			return err
		}
		for _, entry := range plan.Startup {
			namespace, err := run(entry, entry.Path)
			if err != nil {
				return err
			}
			if entry.Package.ID() == plan.Application.ID() {
				s.legacyHandler, _ = sobek.AssertFunction(namespace.Get("handleMessage"))
			}
		}
		if len(game.Automations) > 0 && (game.AutomationService == nil || game.AutomationService.Definitions == nil) {
			return errors.New("saved automations require an automation service")
		}
		var stored []automation.Saved
		stages := map[string]func() error{
			"Load.Data.PreLoad": func() error {
				return s.bridge.FinalizeRecords(layerOrder(plan))
			},
			"Load.Automation.PreLoad": func() error {
				var err error
				stored, err = s.loadAutomations(ctx, game)
				if err != nil {
					return err
				}
				return s.bindAutomations(ctx, stored, automation.CreatorSystem)
			},
			"Load.Automation.Users.PreLoad": func() error {
				return s.bindAutomations(ctx, stored, automation.CreatorUser)
			},
		}
		for _, name := range loadEvents {
			if err := s.engine.InitializeEvent(ctx, name); err != nil {
				return err
			}
			if stage := stages[name]; stage != nil {
				if err := stage(); err != nil {
					return err
				}
			}
		}
		return nil
	})
	err = s.bridge.FinishRequest(ctx, err)
	if err != nil {
		ready <- fmt.Errorf("load game: %w", err)
		return
	}
	s.engine.FinishLoading()
	ready <- nil
	for {
		select {
		case <-s.stop:
			return
		case req := <-s.requests:
			var data json.RawMessage
			scoped, err := scope(req.ctx, game, req.origin)
			if err == nil {
				err = s.execute(scoped, func() error {
					return s.bridge.Within(scoped, req.origin, req.owner, func() error {
						var err error
						data, err = req.operation()
						return err
					})
				})
				err = s.bridge.FinishRequest(scoped, err)
			}
			req.reply <- result{data, err}
		}
	}
}

func scope(ctx context.Context, game Game, origin events.Origin) (context.Context, error) {
	execution := security.Execution(ctx)
	execution.GameID = game.GameID
	execution.SessionID = game.SessionID
	execution.Origin = origin.String()
	return security.WithExecution(ctx, execution)
}

func (s *session) execute(ctx context.Context, fn func() error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	finished := make(chan struct{})
	joined := make(chan struct{})
	go func() {
		defer close(joined)
		select {
		case <-ctx.Done():
			s.vm.Interrupt(ctx.Err())
		case <-s.stop:
			s.vm.Interrupt(ErrClosed)
		case <-finished:
		}
	}()
	err := fn()
	close(finished)
	<-joined
	s.vm.ClearInterrupt()
	var interrupted *sobek.InterruptedError
	if errors.As(err, &interrupted) {
		if cause, ok := interrupted.Value().(error); ok {
			return cause
		}
	}
	return err
}

func (s *session) Dispatch(ctx context.Context, message json.RawMessage) (json.RawMessage, error) {
	if !json.Valid(message) {
		return nil, errors.New("message must be valid JSON")
	}
	message = append(json.RawMessage(nil), message...)
	return s.submit(ctx, events.Server, "application", func() (json.RawMessage, error) {
		if s.legacyHandler == nil {
			return nil, errors.New("game does not define handleMessage; use named events")
		}
		return s.bridge.CallJSON(s.legacyHandler, message)
	})
}

func (s *session) EmitServer(ctx context.Context, name string, payload json.RawMessage) error {
	return s.emit(ctx, events.Server, name, payload)
}
func (s *session) EmitClient(ctx context.Context, name string, payload json.RawMessage) error {
	return s.emit(ctx, events.Client, name, payload)
}
func (s *session) EmitAutomation(ctx context.Context, name string, payload json.RawMessage) error {
	return s.emit(ctx, events.Automation, name, payload)
}
func (s *session) emit(ctx context.Context, origin events.Origin, name string, payload json.RawMessage) error {
	payload = append(json.RawMessage(nil), payload...)
	_, err := s.submit(ctx, origin, "Go adapter", func() (json.RawMessage, error) {
		return nil, s.engine.Emit(s.bridge.Context(), origin, name, payload)
	})
	return err
}

func (s *session) RunAutomation(ctx context.Context, name string, args []any) (automation.Result, error) {
	var result automation.Result

	encoded, err := json.Marshal(args)
	if err != nil {
		return result, err
	}
	var arguments []any
	if err := automation.Decode(encoded, &arguments); err != nil {
		return result, err
	}
	_, err = s.submit(ctx, events.Automation, "automation", func() (json.RawMessage, error) {
		var err error
		result, err = s.bridge.RunAutomation(s.bridge.Context(), name, arguments)
		return nil, err
	})
	if err != nil {
		return automation.Result{}, err
	}
	return result, nil
}

func (s *session) AutomationCommand(ctx context.Context, command string) (automation.Result, error) {
	var result automation.Result
	_, err := s.submit(ctx, events.Automation, "automation", func() (json.RawMessage, error) {

		var err error
		result, err = s.bridge.RunCommand(s.bridge.Context(), command)
		return nil, err
	})
	if err != nil {
		return automation.Result{}, err
	}
	return result, nil
}

func (s *session) SaveAutomation(ctx context.Context, creator automation.Creator, definition automation.Definition) error {
	data, err := json.Marshal(definition)
	if err != nil {
		return err
	}
	if err := automation.Decode(data, &definition); err != nil {
		return err
	}
	_, err = s.submit(ctx, events.Automation, "automation", func() (json.RawMessage, error) {
		return nil, s.bridge.SaveAutomation(s.bridge.Context(), creator, definition)
	})
	return err
}
func (s *session) ListAutomations(ctx context.Context) ([]automation.Saved, error) {
	var result []automation.Saved
	_, err := s.submit(ctx, events.Automation, "automation", func() (json.RawMessage, error) {
		var err error
		result, err = s.bridge.ListAutomations(s.bridge.Context())
		return nil, err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
func (s *session) DeleteAutomation(ctx context.Context, name string) error {
	_, err := s.submit(ctx, events.Automation, "automation", func() (json.RawMessage, error) {
		return nil, s.bridge.DeleteAutomation(s.bridge.Context(), name)
	})
	return err
}

func (s *session) submit(ctx context.Context, origin events.Origin, owner string, operation func() (json.RawMessage, error)) (json.RawMessage, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-s.stop:
			cancel()
		case <-ctx.Done():
		}
	}()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	req := request{ctx: ctx, origin: origin, owner: owner, operation: operation, reply: make(chan result, 1)}
	select {
	case <-s.stop:
		return nil, ErrClosed
	default:
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-s.done:
		return nil, ErrClosed
	case s.requests <- req:
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case reply := <-req.reply:
		return reply.data, reply.err
	}
}

func (s *session) Close() error {
	s.once.Do(func() { close(s.stop) })
	<-s.done
	return nil
}

func (s *session) loadAutomations(ctx context.Context, game Game) ([]automation.Saved, error) {
	if game.AutomationService == nil || game.AutomationService.Definitions == nil {
		return nil, nil
	}
	repository := game.AutomationService.Definitions
	for _, saved := range game.Automations {
		_, err := repository.Load(ctx, saved.Definition.Name)
		if err == nil {
			continue
		}
		if !errors.Is(err, automation.ErrNotFound) {
			return nil, err
		}
		if err := repository.Save(ctx, saved); err != nil {
			return nil, fmt.Errorf("seed automation %s: %w", saved.Definition.Name, err)
		}
	}
	return repository.List(ctx)
}

func (s *session) bindAutomations(ctx context.Context, stored []automation.Saved, kind string) error {
	for _, saved := range stored {
		if saved.Creator.Kind != kind {
			continue
		}
		if err := s.bridge.BindAutomation(ctx, saved.Definition); err != nil {
			return err
		}
	}
	return nil
}

func layerOrder(plan manifest.Plan) []manifest.Package {
	ordered := []manifest.Package{}
	seen := map[string]bool{}
	for _, entry := range append(append([]manifest.Entry(nil), plan.Library...), plan.Startup...) {
		if !seen[entry.Package.ID()] {
			seen[entry.Package.ID()] = true
			ordered = append(ordered, entry.Package)
		}
	}
	return ordered
}

func (s *session) Warnings() []string { return s.bridge.Warnings() }
