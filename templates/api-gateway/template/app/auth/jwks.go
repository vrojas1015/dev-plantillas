package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
)

// errKeyNotFound: el kid no está en el JWKS ni después de refrescarlo.
var errKeyNotFound = errors.New("kid desconocido")

const (
	jwksMaxBytes     = 1 << 20
	jwksDefaultTTL   = time.Hour
	jwksMinTTL       = time.Minute
	jwksMaxTTL       = 24 * time.Hour
	jwksMinRefresh   = 30 * time.Second // refresco por kid desconocido, como mucho cada 30 s
	jwksFetchTimeout = 5 * time.Second
)

// remoteJWKS es un JWKS remoto en caché:
//   - se baja la primera vez que hace falta y se renueva al vencer el TTL
//     (Cache-Control: max-age, acotado entre 1 min y 24 h; 1 h si no viene);
//   - un kid desconocido fuerza un refresco (rotación de claves del
//     proveedor), pero no más de uno cada 30 s: un atacante mandando kids
//     inventados no puede convertir al gateway en un cliente que martilla al IdP;
//   - si un refresco falla se siguen usando las claves que había.
type remoteJWKS struct {
	url    func(ctx context.Context) (string, error) // fija (Firebase) o por discovery (OIDC)
	client *http.Client
	now    func() time.Time

	mu        sync.Mutex
	keys      map[string]jose.JSONWebKey
	fetchedAt time.Time // último intento (exitoso o no)
	expiresAt time.Time
	lastErr   error
}

func newRemoteJWKS(url func(context.Context) (string, error), client *http.Client, now func() time.Time) *remoteJWKS {
	return &remoteJWKS{url: url, client: client, now: now}
}

// key devuelve la clave pública para kid. Si el token no trae kid y el JWKS
// tiene una sola clave, devuelve esa.
func (s *remoteJWKS) key(ctx context.Context, kid string) (jose.JSONWebKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()
	var fetchErr error
	switch {
	case s.keys == nil && !s.fetchedAt.IsZero() && now.Sub(s.fetchedAt) < jwksMinRefresh:
		// El último intento falló hace poco: no reintentar en cada request.
		fetchErr = s.lastErr
	case s.keys == nil || now.After(s.expiresAt):
		fetchErr = s.refresh(ctx)
	}
	if k, ok := s.lookup(kid); ok {
		return k, nil
	}
	if s.keys != nil && fetchErr == nil && now.Sub(s.fetchedAt) >= jwksMinRefresh {
		fetchErr = s.refresh(ctx)
		if k, ok := s.lookup(kid); ok {
			return k, nil
		}
	}
	if s.keys == nil {
		return jose.JSONWebKey{}, fmt.Errorf("%w: %v", ErrUnavailable, fetchErr)
	}
	return jose.JSONWebKey{}, errKeyNotFound
}

func (s *remoteJWKS) lookup(kid string) (jose.JSONWebKey, bool) {
	if kid == "" {
		if len(s.keys) == 1 {
			for _, k := range s.keys {
				return k, true
			}
		}
		return jose.JSONWebKey{}, false
	}
	k, ok := s.keys[kid]
	return k, ok
}

// refresh baja el JWKS. Se llama con s.mu tomado. Si falla y había claves,
// las sigue usando y reintenta en jwksMinRefresh.
func (s *remoteJWKS) refresh(ctx context.Context) error {
	s.fetchedAt = s.now()
	err := s.fetch(ctx)
	s.lastErr = err
	if err != nil && s.keys != nil {
		s.expiresAt = s.fetchedAt.Add(jwksMinRefresh)
	}
	return err
}

func (s *remoteJWKS) fetch(ctx context.Context) error {
	url, err := s.url(ctx)
	if err != nil {
		return err
	}
	// Sin la cancelación del request: si el cliente corta, la descarga sigue
	// (y sirve para los próximos requests).
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jwksFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("JWKS: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS: HTTP %d", resp.StatusCode)
	}
	var set jose.JSONWebKeySet
	if err := json.NewDecoder(io.LimitReader(resp.Body, jwksMaxBytes)).Decode(&set); err != nil {
		return fmt.Errorf("JWKS: %w", err)
	}
	keys := make(map[string]jose.JSONWebKey, len(set.Keys))
	for _, k := range set.Keys {
		// Solo claves públicas de firma RSA/EC; nada simétrico.
		if !k.Valid() || !k.IsPublic() || (k.Use != "" && k.Use != "sig") {
			continue
		}
		if k.Algorithm != "" && !allowedAlg(k.Algorithm) {
			continue
		}
		keys[k.KeyID] = k
	}
	if len(keys) == 0 {
		return errors.New("JWKS sin claves de firma utilizables")
	}
	s.keys = keys
	s.expiresAt = s.fetchedAt.Add(cacheTTL(resp.Header.Get("Cache-Control")))
	return nil
}

func cacheTTL(cc string) time.Duration {
	for _, part := range strings.Split(cc, ",") {
		part = strings.TrimSpace(part)
		if v, ok := strings.CutPrefix(part, "max-age="); ok {
			if secs, err := strconv.Atoi(v); err == nil {
				d := time.Duration(secs) * time.Second
				return min(max(d, jwksMinTTL), jwksMaxTTL)
			}
		}
	}
	return jwksDefaultTTL
}
