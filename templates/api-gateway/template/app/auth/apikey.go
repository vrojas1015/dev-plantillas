package auth

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

// APIKeyHeader es el header donde el cliente manda la key.
const APIKeyHeader = "X-API-Key"

// APIKeyPrefix identifica las keys de este gateway (secret scanning, logs).
const APIKeyPrefix = "gwk_"

var keyIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,62}$`)

// APIKeyEntry es una key en la configuración: SOLO el hash, nunca la key.
//
//	keys:
//	  - id: erp-prod          # identificable en logs y en x-user-id (apikey:erp-prod)
//	    sha256: 9f86d08...    # hex de sha256(key completa)
//	    scopes: [items.read]  # se comparan con roles: de routes.yaml
//	    expires_at: 2027-01-31  # opcional (AAAA-MM-DD o RFC 3339)
//
// Rotación sin corte: agregar la key nueva (otro sha256, mismo id u otro),
// desplegar, migrar al cliente y recién entonces borrar la vieja.
type APIKeyEntry struct {
	ID        string   `yaml:"id"`
	SHA256    string   `yaml:"sha256"`
	Scopes    []string `yaml:"scopes"`
	ExpiresAt string   `yaml:"expires_at"`
}

type apiKey struct {
	id      string
	scopes  []string
	expires time.Time // cero = no vence
}

// APIKeys verifica el header X-API-Key contra hashes SHA-256.
//
// SHA-256 (y no bcrypt/argon2) alcanza porque las keys son aleatorias de 256
// bits: no hay diccionario que probar; y permite buscar por hash en O(1).
type APIKeys struct {
	byHash map[[sha256.Size]byte]apiKey
	now    func() time.Time
}

// LoadAPIKeys lee las keys de inline (variable API_KEYS, típicamente un
// secreto) o, si está vacía, del archivo path (API_KEYS_FILE).
func LoadAPIKeys(inline, path string) (*APIKeys, error) {
	data := []byte(inline)
	if strings.TrimSpace(inline) == "" {
		if path == "" {
			return nil, errors.New("api-key: definí API_KEYS (contenido) o API_KEYS_FILE (ruta)")
		}
		var err error
		if data, err = os.ReadFile(path); err != nil {
			return nil, fmt.Errorf("api-key: %w", err)
		}
	}
	return ParseAPIKeys(data)
}

// ParseAPIKeys valida la configuración (YAML o JSON).
func ParseAPIKeys(data []byte) (*APIKeys, error) {
	var f struct {
		Keys []APIKeyEntry `yaml:"keys"`
	}
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("api-key: YAML inválido: %w", err)
	}
	s := &APIKeys{byHash: make(map[[sha256.Size]byte]apiKey, len(f.Keys)), now: time.Now}
	for i, e := range f.Keys {
		if !keyIDRe.MatchString(e.ID) {
			return nil, fmt.Errorf("api-key #%d: id inválido %q", i+1, e.ID)
		}
		raw, err := hex.DecodeString(strings.ToLower(e.SHA256))
		if err != nil || len(raw) != sha256.Size {
			return nil, fmt.Errorf("api-key %s: sha256 tiene que ser 64 caracteres hex", e.ID)
		}
		var h [sha256.Size]byte
		copy(h[:], raw)
		if _, dup := s.byHash[h]; dup {
			return nil, fmt.Errorf("api-key %s: hash repetido", e.ID)
		}
		k := apiKey{id: e.ID, scopes: append([]string(nil), e.Scopes...)}
		if e.ExpiresAt != "" {
			if k.expires, err = parseExpiry(e.ExpiresAt); err != nil {
				return nil, fmt.Errorf("api-key %s: expires_at: %w", e.ID, err)
			}
		}
		s.byHash[h] = k
	}
	return s, nil
}

func parseExpiry(v string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, nil
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		return time.Time{}, errors.New("formato AAAA-MM-DD o RFC 3339")
	}
	return t.Add(24 * time.Hour), nil // vence al terminar ese día (UTC)
}

// WithClock reemplaza el reloj (tests).
func (s *APIKeys) WithClock(now func() time.Time) *APIKeys {
	s.now = now
	return s
}

// Len devuelve cuántas keys hay configuradas.
func (s *APIKeys) Len() int { return len(s.byHash) }

// Authenticate implementa Authenticator.
func (s *APIKeys) Authenticate(r *http.Request) (*Identity, error) {
	key := r.Header.Get(APIKeyHeader)
	if key == "" {
		return nil, ErrNoCredentials
	}
	if len(key) > 256 {
		return nil, fmt.Errorf("%w: key demasiado larga", ErrInvalidCredentials)
	}
	k, ok := s.byHash[sha256.Sum256([]byte(key))]
	if !ok {
		return nil, fmt.Errorf("%w: key desconocida", ErrInvalidCredentials)
	}
	if !k.expires.IsZero() && !s.now().Before(k.expires) {
		return nil, fmt.Errorf("%w: key %s vencida", ErrInvalidCredentials, k.id)
	}
	return &Identity{Subject: "apikey:" + k.id, Roles: k.scopes, Kind: "apikey"}, nil
}

// GenerateAPIKey crea una key nueva (gwk_ + 32 bytes aleatorios en base64url)
// y devuelve la key (se entrega UNA vez al cliente) y su sha256 en hex (lo
// único que va a la configuración).
func GenerateAPIKey() (key, sha256Hex string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	key = APIKeyPrefix + base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(key))
	return key, hex.EncodeToString(sum[:]), nil
}
