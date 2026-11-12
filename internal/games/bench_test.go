package games

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"

	"easel/internal/database/dbtest"
	"easel/internal/security"
)

func BenchmarkRecordRequest(b *testing.B) {
	pool := dbtest.Open(b)
	entry := tallyTables(b, pool, 1, 1)[0]
	runtime, _ := entry.manager.Runtime(entry.game.ID)
	member := security.WithPrincipal(context.Background(), entry.member.ID)
	payload := json.RawMessage(`{"amount":1,"fail":false}`)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if err := runtime.EmitAuthorizedClient(member, "acme.tally.add", payload); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRecordRequestsAcrossGames(b *testing.B) {
	pool := dbtest.Open(b)
	tables := tallyTables(b, pool, 2, 4)
	payload := json.RawMessage(`{"amount":1,"fail":false}`)
	var next atomic.Int64
	b.ResetTimer()
	b.RunParallel(func(run *testing.PB) {
		entry := tables[int(next.Add(1))%len(tables)]
		runtime, _ := entry.manager.Runtime(entry.game.ID)
		member := security.WithPrincipal(context.Background(), entry.member.ID)
		for run.Next() {
			if err := runtime.EmitAuthorizedClient(member, "acme.tally.add", payload); err != nil {
				b.Fatal(err)
			}
		}
	})
}

func BenchmarkEventDeliveryToSubscribers(b *testing.B) {
	pool := dbtest.Open(b)
	entry := tallyTables(b, pool, 1, 1)[0]
	runtime, _ := entry.manager.Runtime(entry.game.ID)
	member := security.WithPrincipal(context.Background(), entry.member.ID)
	var delivered atomic.Int64
	for subscriber := 0; subscriber < 50; subscriber++ {
		off, err := runtime.SubscribeClient(member, "acme.tally.changed", func(json.RawMessage) { delivered.Add(1) })
		if err != nil {
			b.Fatal(err)
		}
		defer off()
	}
	payload := json.RawMessage(`{"amount":1,"fail":false}`)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if err := runtime.EmitAuthorizedClient(member, "acme.tally.add", payload); err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	if delivered.Load() != int64(b.N)*50 {
		b.Fatalf("delivered %d events for %d requests to 50 subscribers", delivered.Load(), b.N)
	}
}

func BenchmarkSuspendAndResume(b *testing.B) {
	pool := dbtest.Open(b)
	entry := tallyTables(b, pool, 1, 1)[0]
	ctx := context.Background()
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if err := entry.manager.Suspend(ctx, entry.game.ID); err != nil {
			b.Fatal(err)
		}
		if err := entry.manager.Start(ctx, entry.game.ID); err != nil {
			b.Fatal(err)
		}
	}
}
