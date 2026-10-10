// Package auth verifica las credenciales de los clientes del gateway.
//
// El gateway VERIFICA (firma, iss, aud, exp/nbf, hash de la API key); no
// emite ni renueva tokens: eso es del proveedor (Firebase, IdP OIDC) o de un
// servicio de auth propio. Implementaciones:
//
//   - JWTVerifier: JWT firmados (RS256/ES256) con JWKS en caché. Constructores
//     NewFirebase y NewOIDC.
//   - APIKeys: header X-API-Key contra hashes SHA-256 con scopes.
//   - None: sin auth (todas las rutas tienen que ser públicas).
//
// Cuál se usa lo decide la respuesta `auth` de la plantilla (cli/main.go).
package auth

import (
	"errors"
	"net/http"
	"slices"
)

// Errores que el gateway traduce a HTTP:
//
//	ErrNoCredentials      -> 401 en rutas protegidas (anónimo en las públicas)
//	ErrInvalidCredentials -> 401
//	ErrUnavailable        -> 503 (no se pudo verificar: JWKS/discovery caídos)
var (
	ErrNoCredentials      = errors.New("sin credenciales")
	ErrInvalidCredentials = errors.New("credenciales inválidas")
	ErrUnavailable        = errors.New("verificación de credenciales no disponible")
)

// Identity es quién hace el request, ya verificado.
type Identity struct {
	Subject string   // sub del token, o "apikey:<id>"
	Roles   []string // roles del token o scopes de la API key
	Kind    string   // "jwt" | "apikey"
}

// HasAnyRole: alcanza con uno de los requeridos.
func (id *Identity) HasAnyRole(required []string) bool {
	if id == nil {
		return false
	}
	for _, r := range required {
		if slices.Contains(id.Roles, r) {
			return true
		}
	}
	return false
}

// Authenticator verifica las credenciales de un request.
// Sin credenciales devuelve (nil, ErrNoCredentials).
type Authenticator interface {
	Authenticate(r *http.Request) (*Identity, error)
}

// None es el Authenticator de auth=ninguno: nunca hay identidad.
type None struct{}

// Authenticate implementa Authenticator.
func (None) Authenticate(*http.Request) (*Identity, error) { return nil, ErrNoCredentials }
