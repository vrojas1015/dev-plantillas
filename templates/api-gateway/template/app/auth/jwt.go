package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

// Algoritmos aceptados: LISTA CERRADA. Nunca "none" ni HS* (con HS256 un
// atacante firmaría con la clave pública como secreto).
var signingAlgs = []jose.SignatureAlgorithm{jose.RS256, jose.ES256}

func allowedAlg(alg string) bool {
	for _, a := range signingAlgs {
		if string(a) == alg {
			return true
		}
	}
	return false
}

// MaxLeeway es la tolerancia de reloj máxima permitida (exp/nbf/iat).
const MaxLeeway = 60 * time.Second

const maxTokenBytes = 8 << 10

// JWTOptions son las opciones comunes de Firebase y OIDC.
type JWTOptions struct {
	// RolesClaim: claim con los roles (array de strings o string separado por
	// espacios/comas). Admite rutas con puntos: "realm_access.roles". Default "roles".
	RolesClaim string
	// Leeway: tolerancia de reloj, <= 60 s. Default 30 s.
	Leeway time.Duration
	// HTTPClient para bajar JWKS/discovery. Default: timeout de 10 s.
	HTTPClient *http.Client
	// Now reemplaza el reloj (tests).
	Now func() time.Time
}

func (o *JWTOptions) setDefaults() error {
	if o.RolesClaim == "" {
		o.RolesClaim = "roles"
	}
	if o.Leeway == 0 {
		o.Leeway = 30 * time.Second
	}
	if o.Leeway < 0 || o.Leeway > MaxLeeway {
		return fmt.Errorf("leeway %s fuera de rango (0..%s)", o.Leeway, MaxLeeway)
	}
	if o.HTTPClient == nil {
		o.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	return nil
}

// JWTVerifier verifica JWT de un issuer/audience con su JWKS.
type JWTVerifier struct {
	issuer   string
	audience string
	keys     *remoteJWKS
	opts     JWTOptions
	// extra: validaciones propias del proveedor (p. ej. auth_time de Firebase).
	extra func(claims map[string]any, now time.Time) error
}

// Authenticate implementa Authenticator con "Authorization: Bearer <jwt>".
func (v *JWTVerifier) Authenticate(r *http.Request) (*Identity, error) {
	raw, err := bearerToken(r)
	if err != nil {
		return nil, err
	}
	return v.Verify(r.Context(), raw)
}

// Verify valida firma, algoritmo, iss, aud, exp, nbf, iat y sub.
func (v *JWTVerifier) Verify(ctx context.Context, raw string) (*Identity, error) {
	tok, err := jwt.ParseSigned(raw, signingAlgs)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	if len(tok.Headers) != 1 {
		return nil, fmt.Errorf("%w: se esperaba una sola firma", ErrInvalidCredentials)
	}
	hdr := tok.Headers[0]
	key, err := v.keys.key(ctx, hdr.KeyID)
	if err != nil {
		if errors.Is(err, ErrUnavailable) {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	if key.Algorithm != "" && key.Algorithm != hdr.Algorithm {
		return nil, fmt.Errorf("%w: alg del token (%s) distinto al de la clave (%s)", ErrInvalidCredentials, hdr.Algorithm, key.Algorithm)
	}

	var std jwt.Claims
	var all map[string]any
	if err := tok.Claims(key.Key, &std, &all); err != nil {
		return nil, fmt.Errorf("%w: firma: %v", ErrInvalidCredentials, err)
	}
	if std.Expiry == nil {
		return nil, fmt.Errorf("%w: falta exp", ErrInvalidCredentials)
	}
	if !printable(std.Subject, 255) {
		return nil, fmt.Errorf("%w: sub vacío, demasiado largo o con caracteres no imprimibles", ErrInvalidCredentials)
	}
	now := v.opts.Now()
	exp := jwt.Expected{Issuer: v.issuer, AnyAudience: jwt.Audience{v.audience}, Time: now}
	if err := std.ValidateWithLeeway(exp, v.opts.Leeway); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	if v.extra != nil {
		if err := v.extra(all, now); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
		}
	}
	return &Identity{Subject: std.Subject, Roles: rolesFrom(all, v.opts.RolesClaim), Kind: "jwt"}, nil
}

func bearerToken(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", ErrNoCredentials
	}
	scheme, tok, ok := strings.Cut(h, " ")
	if !ok || !strings.EqualFold(scheme, "bearer") {
		return "", fmt.Errorf("%w: se esperaba Authorization: Bearer <token>", ErrInvalidCredentials)
	}
	tok = strings.TrimSpace(tok)
	if tok == "" || len(tok) > maxTokenBytes {
		return "", fmt.Errorf("%w: token vacío o demasiado largo", ErrInvalidCredentials)
	}
	return tok, nil
}

// rolesFrom lee el claim de roles como lista. Primero busca el nombre
// completo (Auth0 usa claims con URL: "https://ejemplo.com/roles"); si no
// está, lo recorre como ruta por puntos ("realm_access.roles").
func rolesFrom(claims map[string]any, path string) []string {
	cur, ok := claims[path]
	if !ok {
		cur = any(claims)
		for _, part := range strings.Split(path, ".") {
			m, isMap := cur.(map[string]any)
			if !isMap {
				return nil
			}
			cur = m[part]
		}
	}
	var raw []string
	switch v := cur.(type) {
	case []any:
		for _, x := range v {
			if s, ok := x.(string); ok {
				raw = append(raw, s)
			}
		}
	case string:
		raw = strings.FieldsFunc(v, func(r rune) bool { return r == ' ' || r == ',' })
	}
	// Los roles viajan en la metadata gRPC x-roles (separados por coma): se
	// descartan los que no son ASCII imprimible o traen comas.
	out := raw[:0]
	for _, r := range raw {
		if printable(r, 128) && !strings.Contains(r, ",") {
			out = append(out, r)
		}
	}
	return out
}

// printable: no vacío, hasta max bytes, solo ASCII visible (válido como
// metadata gRPC y seguro para logs).
func printable(s string, max int) bool {
	if s == "" || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < 0x21 || s[i] > 0x7e {
			return false
		}
	}
	return true
}
