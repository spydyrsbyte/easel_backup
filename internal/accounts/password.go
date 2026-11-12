package accounts

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	argonTime        = 2
	argonMemory      = 19 * 1024
	argonThreads     = 1
	argonKeyLength   = 32
	saltLength       = 16
	minPasswordRunes = 8
	maxPasswordBytes = 256
)

var errMalformedHash = errors.New("malformed password hash")

func checkPassword(password string) error {
	if utf8.RuneCountInString(password) < minPasswordRunes {
		return fmt.Errorf("%w: password must be at least %d characters", ErrInvalidInput, minPasswordRunes)
	}
	if len(password) > maxPasswordBytes {
		return fmt.Errorf("%w: password must be at most %d bytes", ErrInvalidInput, maxPasswordBytes)
	}
	return nil
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLength)
	encode := base64.RawStdEncoding.EncodeToString
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads, encode(salt), encode(key)), nil
}

func VerifyPassword(encoded, password string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errMalformedHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errMalformedHash
	}
	var memory, iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false, errMalformedHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, errMalformedHash
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, errMalformedHash
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

type Limiter struct {
	Max    int
	Window time.Duration
	Now    func() time.Time
	mutex  sync.Mutex
	failed map[string][]time.Time
}

func (l *Limiter) now() time.Time {
	if l.Now != nil {
		return l.Now()
	}
	return time.Now()
}

func (l *Limiter) recent(key string) []time.Time {
	cutoff := l.now().Add(-l.Window)
	kept := l.failed[key][:0]
	for _, at := range l.failed[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) == 0 {
		delete(l.failed, key)
		return nil
	}
	l.failed[key] = kept
	return kept
}

func (l *Limiter) Allow(key string) bool {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	if l.failed == nil {
		l.failed = map[string][]time.Time{}
	}
	return len(l.recent(key)) < l.Max
}

func (l *Limiter) Fail(key string) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	if l.failed == nil {
		l.failed = map[string][]time.Time{}
	}
	l.failed[key] = append(l.recent(key), l.now())
}

func (l *Limiter) Reset(key string) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	delete(l.failed, key)
}
