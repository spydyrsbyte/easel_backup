package seal

import (
	"archive/zip"
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"easel/internal/manifest"
)

const (
	SealedFile      = "package.sealed"
	PublisherFormat = "easel.publisher/1"
	LicenseFormat   = "easel.license/1"
	magic           = "EASELSEAL1\n"
	maxSealedBytes  = 1 << 30
)

var (
	ErrNoLicense = errors.New("no license")
	encoding     = base64.StdEncoding
)

type Publisher struct {
	Format  string `json:"format"`
	Name    string `json:"name"`
	Public  string `json:"public"`
	Signing string `json:"signing"`
	Secret  string `json:"secret"`
}

type License struct {
	Format       string `json:"format"`
	Package      string `json:"package"`
	Major        int    `json:"major"`
	Licensee     string `json:"licensee"`
	Publisher    string `json:"publisher"`
	Installation string `json:"installation"`
	Issued       string `json:"issued"`
	Expires      string `json:"expires,omitempty"`
	Ephemeral    string `json:"ephemeral"`
	Nonce        string `json:"nonce"`
	Key          string `json:"key"`
	Signature    string `json:"signature"`
}

type header struct {
	Package string `json:"package"`
	Version string `json:"version"`
	Major   int    `json:"major"`
	Nonce   string `json:"nonce"`
}

func derive(secret []byte, info string) ([]byte, error) {
	return hkdf.Key(sha256.New, secret, nil, info, 32)
}

func aead(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func NewPublisher(name string) (Publisher, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Publisher{}, fmt.Errorf("a publisher needs a name")
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return Publisher{}, err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return Publisher{}, err
	}
	return Publisher{Format: PublisherFormat, Name: name, Public: encoding.EncodeToString(public), Signing: encoding.EncodeToString(private.Seed()), Secret: encoding.EncodeToString(secret)}, nil
}

func LoadPublisher(file string) (Publisher, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return Publisher{}, err
	}
	var publisher Publisher
	if err := json.Unmarshal(data, &publisher); err != nil || publisher.Format != PublisherFormat {
		return Publisher{}, fmt.Errorf("%s is not an Easel publisher key", file)
	}
	if _, _, err := publisher.keys(); err != nil {
		return Publisher{}, fmt.Errorf("%s: %w", file, err)
	}
	return publisher, nil
}

func (p Publisher) keys() (ed25519.PrivateKey, []byte, error) {
	seed, err := encoding.DecodeString(p.Signing)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, nil, fmt.Errorf("invalid publisher signing key")
	}
	secret, err := encoding.DecodeString(p.Secret)
	if err != nil || len(secret) != 32 {
		return nil, nil, fmt.Errorf("invalid publisher secret")
	}
	private := ed25519.NewKeyFromSeed(seed)
	if encoding.EncodeToString(private.Public().(ed25519.PublicKey)) != p.Public {
		return nil, nil, fmt.Errorf("publisher public key does not match its signing key")
	}
	return private, secret, nil
}

func (p Publisher) lineKey(pkg string, major int) ([]byte, error) {
	_, secret, err := p.keys()
	if err != nil {
		return nil, err
	}
	return derive(secret, "easel.package/"+pkg+"/major/"+strconv.Itoa(major))
}

func releaseKey(line []byte, version string) ([]byte, error) {
	return derive(line, "easel.release/"+version)
}

func (p Publisher) Seal(folder, archive string) (manifest.Package, error) {
	pkg, err := manifest.Load(os.DirFS(folder))
	if err != nil {
		return manifest.Package{}, fmt.Errorf("invalid package: %w", err)
	}
	if !pkg.Manifest.Encrypt.Enabled {
		return manifest.Package{}, fmt.Errorf(`%s does not ask for protection; add "encrypt": {"public": "keys/publisher.pub"} to its manifest`, pkg.ID())
	}
	declared, err := os.ReadFile(filepath.Join(folder, filepath.FromSlash(pkg.Manifest.Encrypt.Public)))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return manifest.Package{}, err
	}
	if err == nil && strings.TrimSpace(string(declared)) != p.Public {
		return manifest.Package{}, fmt.Errorf("%s holds a different publisher's public key", pkg.Manifest.Encrypt.Public)
	}
	var inner bytes.Buffer
	contents := zip.NewWriter(&inner)
	err = filepath.WalkDir(folder, func(current string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		relative, err := filepath.Rel(folder, current)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(relative)
		if name == SealedFile {
			return nil
		}
		data, err := os.ReadFile(current)
		if err != nil {
			return err
		}
		target, err := contents.Create(name)
		if err != nil {
			return err
		}
		_, err = target.Write(data)
		return err
	})
	if err == nil {
		if _, missing := os.Stat(filepath.Join(folder, filepath.FromSlash(pkg.Manifest.Encrypt.Public))); missing != nil {
			var target io.Writer
			if target, err = contents.Create(pkg.Manifest.Encrypt.Public); err == nil {
				_, err = target.Write([]byte(p.Public + "\n"))
			}
		}
	}
	if err == nil {
		err = contents.Close()
	}
	if err != nil {
		return manifest.Package{}, err
	}
	version := pkg.Manifest.Version
	line, err := p.lineKey(pkg.ID(), version.Major)
	if err != nil {
		return manifest.Package{}, err
	}
	key, err := releaseKey(line, version.String())
	if err != nil {
		return manifest.Package{}, err
	}
	gcm, err := aead(key)
	if err != nil {
		return manifest.Package{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return manifest.Package{}, err
	}
	head, err := json.Marshal(header{Package: pkg.ID(), Version: version.String(), Major: version.Major, Nonce: encoding.EncodeToString(nonce)})
	if err != nil {
		return manifest.Package{}, err
	}
	sealed := append([]byte(magic), head...)
	sealed = append(sealed, '\n')
	sealed = gcm.Seal(sealed, nonce, inner.Bytes(), head)
	stub, err := json.MarshalIndent(map[string]any{
		"type": pkg.Manifest.Type, "owner": pkg.Manifest.Owner, "host": pkg.Manifest.Host, "name": pkg.Manifest.Name,
		"version":  map[string]int{"major": version.Major, "minor": version.Minor, "revision": version.Revision},
		"encrypt":  map[string]string{"public": pkg.Manifest.Encrypt.Public},
		"channels": pkg.Manifest.Channels,
	}, "", "  ")
	if err != nil {
		return manifest.Package{}, err
	}
	output, err := os.Create(archive)
	if err != nil {
		return manifest.Package{}, err
	}
	writer := zip.NewWriter(output)
	for name, data := range map[string][]byte{manifest.FileName: stub, pkg.Manifest.Encrypt.Public: []byte(p.Public + "\n"), SealedFile: sealed} {
		var target io.Writer
		if target, err = writer.Create(name); err == nil {
			_, err = target.Write(data)
		}
		if err != nil {
			break
		}
	}
	if closeErr := writer.Close(); err == nil {
		err = closeErr
	}
	if closeErr := output.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(archive)
		return manifest.Package{}, err
	}
	return pkg, nil
}

func (l License) signed() []byte {
	return []byte(strings.Join([]string{l.Format, l.Package, strconv.Itoa(l.Major), l.Licensee, l.Publisher, l.Installation, l.Issued, l.Expires, l.Ephemeral, l.Nonce, l.Key}, "\n"))
}

func (p Publisher) Issue(pkg string, major int, installation, licensee string, expires time.Time, now time.Time) (License, error) {
	private, _, err := p.keys()
	if err != nil {
		return License{}, err
	}
	if strings.Count(pkg, ".") != 2 {
		return License{}, fmt.Errorf("name the package as owner.host.name")
	}
	if strings.TrimSpace(licensee) == "" || strings.Contains(licensee, "\n") {
		return License{}, fmt.Errorf("a license names who it is issued to")
	}
	raw, err := encoding.DecodeString(strings.TrimSpace(installation))
	if err != nil {
		return License{}, fmt.Errorf("invalid installation key")
	}
	recipient, err := ecdh.X25519().NewPublicKey(raw)
	if err != nil {
		return License{}, fmt.Errorf("invalid installation key")
	}
	ephemeral, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return License{}, err
	}
	shared, err := ephemeral.ECDH(recipient)
	if err != nil {
		return License{}, err
	}
	wrapping, err := derive(shared, "easel.license/"+pkg+"/"+strconv.Itoa(major))
	if err != nil {
		return License{}, err
	}
	gcm, err := aead(wrapping)
	if err != nil {
		return License{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return License{}, err
	}
	line, err := p.lineKey(pkg, major)
	if err != nil {
		return License{}, err
	}
	license := License{
		Format: LicenseFormat, Package: pkg, Major: major, Licensee: strings.TrimSpace(licensee), Publisher: p.Public,
		Installation: encoding.EncodeToString(recipient.Bytes()), Issued: now.UTC().Format(time.RFC3339),
		Ephemeral: encoding.EncodeToString(ephemeral.PublicKey().Bytes()), Nonce: encoding.EncodeToString(nonce),
		Key: encoding.EncodeToString(gcm.Seal(nil, nonce, line, nil)),
	}
	if !expires.IsZero() {
		license.Expires = expires.UTC().Format(time.RFC3339)
	}
	license.Signature = encoding.EncodeToString(ed25519.Sign(private, license.signed()))
	return license, nil
}

type Store struct {
	Dir     string
	KeyFile string
	Now     func() time.Time
}

func (s *Store) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Store) private(create bool) (*ecdh.PrivateKey, error) {
	data, err := os.ReadFile(s.KeyFile)
	if errors.Is(err, fs.ErrNotExist) && create {
		key, err := ecdh.X25519().GenerateKey(rand.Reader)
		if err != nil {
			return nil, err
		}
		if err := os.MkdirAll(filepath.Dir(s.KeyFile), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(s.KeyFile, []byte(encoding.EncodeToString(key.Bytes())+"\n"), 0o600); err != nil {
			return nil, err
		}
		return key, nil
	}
	if err != nil {
		return nil, err
	}
	raw, err := encoding.DecodeString(strings.TrimSpace(string(data)))
	if err != nil {
		return nil, fmt.Errorf("%s is not an installation key", s.KeyFile)
	}
	return ecdh.X25519().NewPrivateKey(raw)
}

func (s *Store) Installation() (string, error) {
	key, err := s.private(true)
	if err != nil {
		return "", err
	}
	return encoding.EncodeToString(key.PublicKey().Bytes()), nil
}

func (l License) verify(now time.Time) error {
	if l.Format != LicenseFormat {
		return fmt.Errorf("not an Easel license")
	}
	public, err := encoding.DecodeString(l.Publisher)
	if err != nil || len(public) != ed25519.PublicKeySize {
		return fmt.Errorf("the license names an invalid publisher key")
	}
	signature, err := encoding.DecodeString(l.Signature)
	if err != nil || !ed25519.Verify(ed25519.PublicKey(public), l.signed(), signature) {
		return fmt.Errorf("the license signature is invalid; it was altered or not issued by its publisher")
	}
	if l.Expires != "" {
		expires, err := time.Parse(time.RFC3339, l.Expires)
		if err != nil {
			return fmt.Errorf("the license has an invalid expiry")
		}
		if !now.Before(expires) {
			return fmt.Errorf("the license issued to %s expired on %s", l.Licensee, expires.Format("2006-01-02"))
		}
	}
	return nil
}

func (s *Store) file(pkg string, major int) string {
	return filepath.Join(s.Dir, pkg+"-"+strconv.Itoa(major)+".license")
}

func (s *Store) Install(data []byte) (License, error) {
	var license License
	if err := json.Unmarshal(data, &license); err != nil {
		return License{}, fmt.Errorf("not an Easel license")
	}
	if err := license.verify(s.now()); err != nil {
		return License{}, err
	}
	installation, err := s.Installation()
	if err != nil {
		return License{}, err
	}
	if license.Installation != installation {
		return License{}, fmt.Errorf("this license was issued to another installation; ask the publisher for one issued to %s", installation)
	}
	if strings.Count(license.Package, ".") != 2 || strings.ContainsAny(license.Package, `/\:`) {
		return License{}, fmt.Errorf("the license names an invalid package")
	}
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return License{}, err
	}
	encoded, err := json.MarshalIndent(license, "", "  ")
	if err != nil {
		return License{}, err
	}
	return license, os.WriteFile(s.file(license.Package, license.Major), append(encoded, '\n'), 0o600)
}

func (s *Store) List() ([]License, error) {
	entries, err := os.ReadDir(s.Dir)
	if errors.Is(err, fs.ErrNotExist) {
		return []License{}, nil
	}
	if err != nil {
		return nil, err
	}
	licenses := []License{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".license") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.Dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		var license License
		if json.Unmarshal(data, &license) == nil {
			license.Key, license.Signature, license.Nonce, license.Ephemeral = "", "", "", ""
			licenses = append(licenses, license)
		}
	}
	sort.Slice(licenses, func(a, b int) bool {
		return licenses[a].Package+strconv.Itoa(licenses[a].Major) < licenses[b].Package+strconv.Itoa(licenses[b].Major)
	})
	return licenses, nil
}

func (s *Store) lineKey(pkg string, major int, publisher string) ([]byte, License, error) {
	installation, _ := s.Installation()
	missing := fmt.Errorf("%w for protected package %s (version line %d) on this installation; send its publisher this installation key and install the license they return with \"easel license install\": %s", ErrNoLicense, pkg, major, installation)
	data, err := os.ReadFile(s.file(pkg, major))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, License{}, missing
	}
	if err != nil {
		return nil, License{}, err
	}
	var license License
	if err := json.Unmarshal(data, &license); err != nil {
		return nil, License{}, fmt.Errorf("the license for %s is unreadable", pkg)
	}
	if err := license.verify(s.now()); err != nil {
		return nil, License{}, fmt.Errorf("license for %s: %w", pkg, err)
	}
	if license.Package != pkg || license.Major != major {
		return nil, License{}, missing
	}
	if license.Publisher != publisher {
		return nil, License{}, fmt.Errorf("the license for %s was issued by a different publisher than the one that sealed the package", pkg)
	}
	private, err := s.private(false)
	if err != nil {
		return nil, License{}, missing
	}
	if license.Installation != encoding.EncodeToString(private.PublicKey().Bytes()) {
		return nil, License{}, missing
	}
	raw, err := encoding.DecodeString(license.Ephemeral)
	if err != nil {
		return nil, License{}, fmt.Errorf("the license for %s is damaged", pkg)
	}
	ephemeral, err := ecdh.X25519().NewPublicKey(raw)
	if err != nil {
		return nil, License{}, fmt.Errorf("the license for %s is damaged", pkg)
	}
	shared, err := private.ECDH(ephemeral)
	if err != nil {
		return nil, License{}, err
	}
	wrapping, err := derive(shared, "easel.license/"+pkg+"/"+strconv.Itoa(major))
	if err != nil {
		return nil, License{}, err
	}
	gcm, err := aead(wrapping)
	if err != nil {
		return nil, License{}, err
	}
	nonce, nonceErr := encoding.DecodeString(license.Nonce)
	wrapped, keyErr := encoding.DecodeString(license.Key)
	if nonceErr != nil || keyErr != nil || len(nonce) != gcm.NonceSize() {
		return nil, License{}, fmt.Errorf("the license for %s is damaged", pkg)
	}
	line, err := gcm.Open(nil, nonce, wrapped, nil)
	if err != nil {
		return nil, License{}, fmt.Errorf("the license for %s does not open on this installation", pkg)
	}
	return line, license, nil
}

var configured atomic.Pointer[Store]

func Configure(store *Store) { configured.Store(store) }

func Configured() *Store { return configured.Load() }

func Sealed(files fs.FS) bool {
	_, err := fs.Stat(files, SealedFile)
	return err == nil
}

func Load(files fs.FS) (manifest.Package, error) {
	if !Sealed(files) {
		return manifest.Load(files)
	}
	data, err := fs.ReadFile(files, manifest.FileName)
	if err != nil {
		return manifest.Package{}, fmt.Errorf("read %s: %w", manifest.FileName, err)
	}
	var stub struct {
		Owner   string           `json:"owner"`
		Host    string           `json:"host"`
		Name    string           `json:"name"`
		Version manifest.Version `json:"version"`
		Encrypt struct {
			Public string `json:"public"`
		} `json:"encrypt"`
	}
	if err := json.Unmarshal(data, &stub); err != nil {
		return manifest.Package{}, fmt.Errorf("invalid %s: %w", manifest.FileName, err)
	}
	id := stub.Owner + "." + stub.Host + "." + stub.Name
	keyFile, err := manifest.CleanPath(stub.Encrypt.Public)
	if err != nil {
		return manifest.Package{}, fmt.Errorf("protected package %s: %w", id, err)
	}
	publisher, err := fs.ReadFile(files, keyFile)
	if err != nil {
		return manifest.Package{}, fmt.Errorf("protected package %s has no publisher key: %w", id, err)
	}
	file, err := files.Open(SealedFile)
	if err != nil {
		return manifest.Package{}, err
	}
	sealed, err := io.ReadAll(io.LimitReader(file, maxSealedBytes+1))
	file.Close()
	if err != nil {
		return manifest.Package{}, err
	}
	if len(sealed) > maxSealedBytes || !bytes.HasPrefix(sealed, []byte(magic)) {
		return manifest.Package{}, fmt.Errorf("protected package %s is damaged", id)
	}
	rawHead, ciphertext, found := bytes.Cut(sealed[len(magic):], []byte("\n"))
	var head header
	if !found || json.Unmarshal(rawHead, &head) != nil {
		return manifest.Package{}, fmt.Errorf("protected package %s is damaged", id)
	}
	if head.Package != id || head.Version != stub.Version.String() || head.Major != stub.Version.Major {
		return manifest.Package{}, fmt.Errorf("protected package %s does not match its manifest", id)
	}
	store := Configured()
	if store == nil {
		return manifest.Package{}, fmt.Errorf("%w: package %s is protected and this Easel has no license store", ErrNoLicense, id)
	}
	line, _, err := store.lineKey(id, head.Major, strings.TrimSpace(string(publisher)))
	if err != nil {
		return manifest.Package{}, err
	}
	key, err := releaseKey(line, head.Version)
	if err != nil {
		return manifest.Package{}, err
	}
	gcm, err := aead(key)
	if err != nil {
		return manifest.Package{}, err
	}
	nonce, err := encoding.DecodeString(head.Nonce)
	if err != nil || len(nonce) != gcm.NonceSize() {
		return manifest.Package{}, fmt.Errorf("protected package %s is damaged", id)
	}
	plain, err := gcm.Open(nil, nonce, ciphertext, rawHead)
	if err != nil {
		return manifest.Package{}, fmt.Errorf("protected package %s does not open with this installation's license; it is damaged or was sealed by another publisher", id)
	}
	inner, err := zip.NewReader(bytes.NewReader(plain), int64(len(plain)))
	if err != nil {
		return manifest.Package{}, fmt.Errorf("protected package %s is damaged: %w", id, err)
	}
	pkg, err := manifest.Load(inner)
	if err != nil {
		return manifest.Package{}, err
	}
	if pkg.ID() != id || pkg.Manifest.Version != stub.Version {
		return manifest.Package{}, fmt.Errorf("protected package %s does not match its manifest", id)
	}
	pkg.Unsealed = true
	return pkg, nil
}
