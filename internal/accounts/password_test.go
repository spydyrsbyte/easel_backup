package accounts

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestPasswordHashing(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("hash format: %s", hash)
	}
	other, _ := HashPassword("correct horse battery")
	if other == hash {
		t.Fatal("hashes are not salted")
	}
	for password, want := range map[string]bool{"correct horse battery": true, "correct horse batterY": false, "": false} {
		if got, err := VerifyPassword(hash, password); err != nil || got != want {
			t.Fatalf("verify %q: %v %v", password, got, err)
		}
	}
	if _, err := VerifyPassword("$argon2i$bad", "x"); !errors.Is(err, errMalformedHash) {
		t.Fatalf("malformed: %v", err)
	}
	for password, want := range map[string]string{"short": "at least 8", strings.Repeat("x", 257): "at most 256"} {
		if err := checkPassword(password); !errors.Is(err, ErrInvalidInput) || !strings.Contains(err.Error(), want) {
			t.Fatalf("%q: %v", password, err)
		}
	}
}

func TestLimiter(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	limiter := &Limiter{Max: 2, Window: time.Minute, Now: func() time.Time { return now }}
	limiter.Fail("a")
	limiter.Fail("a")
	if limiter.Allow("a") || !limiter.Allow("b") {
		t.Fatal("limit not applied per key")
	}
	now = now.Add(61 * time.Second)
	if !limiter.Allow("a") {
		t.Fatal("failures did not expire")
	}
	limiter.Fail("a")
	limiter.Fail("a")
	limiter.Reset("a")
	if !limiter.Allow("a") {
		t.Fatal("reset ignored")
	}
}
