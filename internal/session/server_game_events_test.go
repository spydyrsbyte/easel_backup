package session

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"easel/internal/manifest"
)

type mockServerGames struct {
	mu        sync.Mutex
	listeners map[string][]func(gameID string, payload json.RawMessage)
	emitted   []struct {
		event    string
		payload  json.RawMessage
		targetID string
	}
}

func (m *mockServerGames) Create(ctx context.Context, name, application string, modules []string, access string) (any, error) {
	return nil, nil
}
func (m *mockServerGames) List(ctx context.Context) (any, error)        { return nil, nil }
func (m *mockServerGames) Get(ctx context.Context, id string) (any, error) { return nil, nil }
func (m *mockServerGames) SetAccess(ctx context.Context, id, access string) error {
	return nil
}
func (m *mockServerGames) Start(ctx context.Context, id string) error           { return nil }
func (m *mockServerGames) Stop(id string) error                                  { return nil }
func (m *mockServerGames) Delete(ctx context.Context, id string) error          { return nil }
func (m *mockServerGames) AddMember(ctx context.Context, id, userID string) error { return nil }
func (m *mockServerGames) Members(ctx context.Context, id string) (any, error)   { return nil, nil }
func (m *mockServerGames) Remove(ctx context.Context, id, userID string) error    { return nil }
func (m *mockServerGames) Installed() any                                        { return nil }

func (m *mockServerGames) OnEvent(eventName string, handler func(gameID string, payload json.RawMessage)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.listeners == nil {
		m.listeners = make(map[string][]func(gameID string, payload json.RawMessage))
	}
	m.listeners[eventName] = append(m.listeners[eventName], handler)
}

func (m *mockServerGames) EmitEvent(eventName string, payload json.RawMessage, targetID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emitted = append(m.emitted, struct {
		event    string
		payload  json.RawMessage
		targetID string
	}{eventName, payload, targetID})
	return nil
}

func TestGameToServerAndServerToGameEvents(t *testing.T) {
	mockGames := &mockServerGames{}
	serverPkg := newPackage(t, `{"type":"application","owner":"easel","host":"test","name":"serverapp","server":{"application":{"entry":"main.mjs"}}}`, map[string]string{
		"main.mjs": `
Games.on("gameHello", (id, payload) => {
  Games.emit("serverReply", { replyTo: id, echo: payload.greeting }, id);
});
`,
	})
	serverSession, err := NewGame(context.Background(), Game{
		GameID:    "server",
		SessionID: "server-sess",
		Server:    true,
		Games:     mockGames,
		Packages:  []manifest.Package{serverPkg},
		AuthorizeClient: func(context.Context, string, json.RawMessage, bool) error { return nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()

	gamePkg := newPackage(t, `{"type":"application","owner":"easel","host":"test","name":"gameapp","server":{"application":{"entry":"main.mjs"}}}`, map[string]string{
		"main.mjs": `
Server.events.on("serverReply", (payload) => {
  globalThis.__reply = payload.echo;
});
export function handleMessage(message) {
  if (message.action === "sendHello") {
    Server.events.emit("gameHello", { greeting: message.greeting });
  }
  return { reply: globalThis.__reply || null };
}
`,
	})

	var emittedUpwardGameID string
	var emittedUpwardEvent string
	var emittedUpwardPayload json.RawMessage

	gameSession, err := NewGame(context.Background(), Game{
		GameID:    "table-1234",
		SessionID: "table-sess-1",
		Server:    false,
		Packages:  []manifest.Package{gamePkg},
		AuthorizeClient: func(context.Context, string, json.RawMessage, bool) error { return nil },
		EmitServerEvent: func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error {
			emittedUpwardGameID = gameID
			emittedUpwardEvent = eventName
			emittedUpwardPayload = append(json.RawMessage(nil), payload...)

			mockGames.mu.Lock()
			var listeners []func(string, json.RawMessage)
			if mockGames.listeners != nil {
				listeners = append(listeners, mockGames.listeners[eventName]...)
			}
			mockGames.mu.Unlock()
			for _, fn := range listeners {
				fn(gameID, payload)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer gameSession.Close()

	// 1. Game emits to Server
	_, err = gameSession.Dispatch(context.Background(), json.RawMessage(`{"action":"sendHello","greeting":"Greetings from Game Table!"}`))
	if err != nil {
		t.Fatal(err)
	}

	if emittedUpwardGameID != "table-1234" {
		t.Fatalf("expected emitted gameID 'table-1234', got %q", emittedUpwardGameID)
	}
	if emittedUpwardEvent != "gameHello" {
		t.Fatalf("expected emitted event 'gameHello', got %q", emittedUpwardEvent)
	}
	var gamePayload struct {
		Greeting string `json:"greeting"`
	}
	if err := json.Unmarshal(emittedUpwardPayload, &gamePayload); err != nil || gamePayload.Greeting != "Greetings from Game Table!" {
		t.Fatalf("unexpected game payload: %s", string(emittedUpwardPayload))
	}

	// Wait for server session to process the incoming event and call Games.emit
	var serverEmitted struct {
		event    string
		payload  json.RawMessage
		targetID string
	}
	for i := 0; i < 50; i++ {
		mockGames.mu.Lock()
		if len(mockGames.emitted) > 0 {
			serverEmitted = mockGames.emitted[0]
			mockGames.mu.Unlock()
			break
		}
		mockGames.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}

	if serverEmitted.event != "serverReply" {
		t.Fatalf("expected server emitted event 'serverReply', got %q", serverEmitted.event)
	}
	if serverEmitted.targetID != "table-1234" {
		t.Fatalf("expected server targetID 'table-1234', got %q", serverEmitted.targetID)
	}
	var replyPayload struct {
		ReplyTo string `json:"replyTo"`
		Echo    string `json:"echo"`
	}
	if err := json.Unmarshal(serverEmitted.payload, &replyPayload); err != nil || replyPayload.Echo != "Greetings from Game Table!" {
		t.Fatalf("unexpected server reply payload: %s", string(serverEmitted.payload))
	}

	// 2. Deliver server event back to game table
	clientRuntime := gameSession.(ClientRuntime)
	if err := clientRuntime.DeliverServerEvent(serverEmitted.event, serverEmitted.payload); err != nil {
		t.Fatal(err)
	}

	// 3. Verify game received and processed the event
	replyMsg, err := gameSession.Dispatch(context.Background(), json.RawMessage(`{"action":"check"}`))
	if err != nil {
		t.Fatal(err)
	}
	var stateResult struct {
		Reply string `json:"reply"`
	}
	if err := json.Unmarshal(replyMsg, &stateResult); err != nil || stateResult.Reply != "Greetings from Game Table!" {
		t.Fatalf("expected game table __reply 'Greetings from Game Table!', got: %s", string(replyMsg))
	}
}
