package games

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ownershipNamespace = 1163219276
	ownershipCheck     = 10 * time.Second
)

var ErrOwnedElsewhere = errors.New("another Easel process is running this game on the same database")

type ownership struct {
	mu       sync.Mutex
	conn     *pgxpool.Conn
	held     map[string]bool
	instance string
	stop     chan struct{}
}

func newInstance() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate instance id: %w", err)
	}
	raw[6], raw[8] = raw[6]&0x0f|0x40, raw[8]&0x3f|0x80
	text := hex.EncodeToString(raw)
	return text[:8] + "-" + text[8:12] + "-" + text[12:16] + "-" + text[16:20] + "-" + text[20:], nil
}

func (m *Manager) Claim(ctx context.Context, id string) (func(), error) {
	if !validID(id) {
		return nil, ErrUnknownGame
	}
	o := &m.owned
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.held[id] {
		return nil, ErrRunning
	}
	if o.conn == nil {
		conn, err := m.Pool.Acquire(ctx)
		if err != nil {
			return nil, fmt.Errorf("reserve a connection for game ownership: %w", err)
		}
		if o.instance == "" {
			if o.instance, err = newInstance(); err != nil {
				conn.Release()
				return nil, err
			}
		}
		o.conn, o.held, o.stop = conn, map[string]bool{}, make(chan struct{})
		go m.watchOwnership(conn, o.stop)
	}
	var locked bool
	err := o.conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1,hashtext($2))`, ownershipNamespace, id).Scan(&locked)
	if err == nil && !locked {
		err = ErrOwnedElsewhere
	} else if err != nil {
		err = fmt.Errorf("claim game %s: %w", id, err)
	}
	if err != nil {
		if len(o.held) == 0 {
			close(o.stop)
			o.conn.Release()
			o.conn, o.stop = nil, nil
		}
		return nil, err
	}
	o.held[id] = true
	_, _ = o.conn.Exec(ctx, `INSERT INTO game_data.runtime_owners(game_id,instance_id) VALUES($1,$2)
 ON CONFLICT(game_id) DO UPDATE SET instance_id=EXCLUDED.instance_id,claimed_at=now(),heartbeat_at=now()`, id, o.instance)
	var once sync.Once
	return func() { once.Do(func() { m.unclaim(id) }) }, nil
}

func (m *Manager) unclaim(id string) {
	o := &m.owned
	o.mu.Lock()
	defer o.mu.Unlock()
	if !o.held[id] || o.conn == nil {
		return
	}
	delete(o.held, id)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = o.conn.Exec(ctx, `DELETE FROM game_data.runtime_owners WHERE game_id=$1 AND instance_id=$2`, id, o.instance)
	_, _ = o.conn.Exec(ctx, `SELECT pg_advisory_unlock($1,hashtext($2))`, ownershipNamespace, id)
	if len(o.held) == 0 {
		close(o.stop)
		o.conn.Release()
		o.conn, o.stop = nil, nil
	}
}

func (m *Manager) releaseOwnership() {
	o := &m.owned
	o.mu.Lock()
	held := make([]string, 0, len(o.held))
	for id := range o.held {
		held = append(held, id)
	}
	o.mu.Unlock()
	for _, id := range held {
		m.unclaim(id)
	}
}

func (m *Manager) watchOwnership(conn *pgxpool.Conn, stop chan struct{}) {
	ticker := time.NewTicker(ownershipCheck)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
		}
		o := &m.owned
		o.mu.Lock()
		if o.conn != conn {
			o.mu.Unlock()
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := conn.Ping(ctx)
		cancel()
		if err == nil {
			o.mu.Unlock()
			continue
		}
		lost := make([]string, 0, len(o.held))
		for id := range o.held {
			lost = append(lost, id)
		}
		o.held = map[string]bool{}
		conn.Conn().Close(context.Background())
		conn.Release()
		o.conn, o.stop = nil, nil
		o.mu.Unlock()
		for _, id := range lost {
			_ = m.halt(id, "", true)
		}
		if m.OwnershipLost != nil {
			m.OwnershipLost(lost, err)
		}
		return
	}
}

func (m *Manager) Owner(ctx context.Context, id string) (string, time.Time, error) {
	var instance string
	var claimed time.Time
	if err := m.Pool.QueryRow(ctx, `SELECT instance_id::text,claimed_at FROM game_data.runtime_owners WHERE game_id::text=$1`, id).Scan(&instance, &claimed); err != nil {
		return "", time.Time{}, err
	}
	return instance, claimed, nil
}
