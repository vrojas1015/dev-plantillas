// Package authtest es un emisor de JWT de PRUEBA para los tests: un servidor
// httptest con discovery OIDC + JWKS y claves generadas en memoria. Solo lo
// importan archivos _test.go; nunca el binario.
package authtest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

// Issuer sirve /.well-known/openid-configuration y /jwks, y firma tokens.
type Issuer struct {
	Server *httptest.Server
	// IssuerOverride: valor de "iss" en el discovery y en los tokens (p. ej.
	// https://securetoken.google.com/<proyecto> para simular Firebase). Vacío =
	// la URL del servidor.
	IssuerOverride string

	mu         sync.Mutex
	rsaKey     *rsa.PrivateKey
	ecKey      *ecdsa.PrivateKey
	kidSeq     int
	rsaKid     string
	ecKid      string
	JWKSHits   atomic.Int64
	JWKSFailed atomic.Bool // true: /jwks responde 500
}

// NewIssuer arranca el emisor; se cierra solo al terminar el test.
func NewIssuer(t testing.TB) *Issuer {
	t.Helper()
	is := &Issuer{}
	is.Rotate()
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":   is.Issuer(),
			"jwks_uri": is.Server.URL + "/jwks",
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		is.JWKSHits.Add(1)
		if is.JWKSFailed.Load() {
			http.Error(w, "caído", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(is.JWKS())
	})
	is.Server = httptest.NewServer(mux)
	t.Cleanup(is.Server.Close)
	return is
}

// Issuer devuelve el "iss" que usa este emisor.
func (is *Issuer) Issuer() string {
	if is.IssuerOverride != "" {
		return is.IssuerOverride
	}
	return is.Server.URL
}

// JWKSURL devuelve la URL del JWKS.
func (is *Issuer) JWKSURL() string { return is.Server.URL + "/jwks" }

// Rotate genera claves nuevas con kids nuevos (simula la rotación del IdP).
func (is *Issuer) Rotate() {
	is.mu.Lock()
	defer is.mu.Unlock()
	rk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	ek, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}
	is.kidSeq++
	is.rsaKey, is.ecKey = rk, ek
	is.rsaKid = fmt.Sprintf("rsa-%d", is.kidSeq)
	is.ecKid = fmt.Sprintf("ec-%d", is.kidSeq)
}

// JWKS devuelve las claves públicas actuales.
func (is *Issuer) JWKS() jose.JSONWebKeySet {
	is.mu.Lock()
	defer is.mu.Unlock()
	return jose.JSONWebKeySet{Keys: []jose.JSONWebKey{
		{Key: &is.rsaKey.PublicKey, KeyID: is.rsaKid, Algorithm: string(jose.RS256), Use: "sig"},
		{Key: &is.ecKey.PublicKey, KeyID: is.ecKid, Algorithm: string(jose.ES256), Use: "sig"},
	}}
}

// Claims arma claims válidas por defecto para (sub, aud, roles).
func (is *Issuer) Claims(sub, aud string, roles ...string) map[string]any {
	now := time.Now()
	c := map[string]any{
		"iss":       is.Issuer(),
		"aud":       aud,
		"sub":       sub,
		"iat":       now.Unix(),
		"nbf":       now.Unix(),
		"exp":       now.Add(10 * time.Minute).Unix(),
		"auth_time": now.Unix(),
	}
	if roles != nil {
		c["roles"] = roles
	}
	return c
}

// Sign firma claims con RS256 (o ES256 si es=true) y el kid actual.
func (is *Issuer) Sign(claims map[string]any, es bool) string {
	is.mu.Lock()
	key := jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: is.rsaKey, KeyID: is.rsaKid}}
	if es {
		key = jose.SigningKey{Algorithm: jose.ES256, Key: jose.JSONWebKey{Key: is.ecKey, KeyID: is.ecKid}}
	}
	is.mu.Unlock()
	return SignWith(key, claims)
}

// SignWith firma con una clave arbitraria (tokens inválidos a propósito).
func SignWith(key jose.SigningKey, claims map[string]any) string {
	sig, err := jose.NewSigner(key, (&jose.SignerOptions{}).WithType("JWT"))
	if err != nil {
		panic(err)
	}
	tok, err := jwt.Signed(sig).Claims(claims).Serialize()
	if err != nil {
		panic(err)
	}
	return tok
}

// Token es atajo de Sign(Claims(...), false).
func (is *Issuer) Token(sub, aud string, roles ...string) string {
	return is.Sign(is.Claims(sub, aud, roles...), false)
}
