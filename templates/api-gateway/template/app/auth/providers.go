package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// FirebaseJWKSURL es el JWKS de los ID tokens de Firebase Auth
// (securetoken@system.gserviceaccount.com, formato JWK; el mismo juego de
// claves que publica en x509 .../robot/v1/metadata/x509/securetoken@...).
const FirebaseJWKSURL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

// FirebaseOptions agrega a JWTOptions la URL del JWKS (solo para tests).
type FirebaseOptions struct {
	JWTOptions
	JWKSURL string
}

// NewFirebase verifica ID tokens de Firebase Auth del proyecto:
// iss = https://securetoken.google.com/<proyecto>, aud = <proyecto>,
// RS256 con las claves de securetoken, auth_time en el pasado.
// Los roles salen de custom claims (setCustomUserClaims) en RolesClaim.
func NewFirebase(projectID string, o FirebaseOptions) (*JWTVerifier, error) {
	if projectID == "" {
		return nil, errors.New("firebase: falta el ID del proyecto (FIREBASE_PROJECT_ID)")
	}
	if err := o.setDefaults(); err != nil {
		return nil, err
	}
	jwksURL := o.JWKSURL
	if jwksURL == "" {
		jwksURL = FirebaseJWKSURL
	}
	v := &JWTVerifier{
		issuer:   "https://securetoken.google.com/" + projectID,
		audience: projectID,
		keys: newRemoteJWKS(func(context.Context) (string, error) { return jwksURL, nil },
			o.HTTPClient, o.Now),
		opts: o.JWTOptions,
	}
	leeway := o.Leeway
	v.extra = func(claims map[string]any, now time.Time) error {
		at, ok := claims["auth_time"].(float64)
		if !ok {
			return errors.New("falta auth_time")
		}
		if time.Unix(int64(at), 0).After(now.Add(leeway)) {
			return errors.New("auth_time en el futuro")
		}
		return nil
	}
	return v, nil
}

// OIDCOptions agrega a JWTOptions el permiso de issuers http (solo desarrollo).
type OIDCOptions struct {
	JWTOptions
	AllowInsecureIssuer bool
}

// NewOIDC verifica JWT de un IdP OIDC: lee <issuer>/.well-known/openid-configuration
// (la primera vez que hace falta, con reintentos), exige que el issuer del
// documento sea idéntico al configurado y baja el JWKS de jwks_uri.
func NewOIDC(issuer, audience string, o OIDCOptions) (*JWTVerifier, error) {
	if issuer == "" || audience == "" {
		return nil, errors.New("oidc: faltan OIDC_ISSUER y/o OIDC_AUDIENCE")
	}
	u, err := url.Parse(issuer)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("oidc: issuer inválido %q", issuer)
	}
	if u.Scheme != "https" && !(o.AllowInsecureIssuer && u.Scheme == "http") {
		return nil, fmt.Errorf("oidc: el issuer tiene que ser https (vino %q)", issuer)
	}
	if err := o.setDefaults(); err != nil {
		return nil, err
	}
	d := &discovery{issuer: issuer, client: o.HTTPClient, allowHTTP: o.AllowInsecureIssuer, now: o.Now}
	return &JWTVerifier{
		issuer:   issuer,
		audience: audience,
		keys:     newRemoteJWKS(d.jwksURL, o.HTTPClient, o.Now),
		opts:     o.JWTOptions,
	}, nil
}

// discovery resuelve jwks_uri una vez (y reintenta, como mucho cada 30 s, si falló).
type discovery struct {
	issuer    string
	client    *http.Client
	allowHTTP bool
	now       func() time.Time

	mu      sync.Mutex
	uri     string
	lastTry time.Time
	lastErr error
}

func (d *discovery) jwksURL(ctx context.Context) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.uri != "" {
		return d.uri, nil
	}
	if !d.lastTry.IsZero() && d.now().Sub(d.lastTry) < jwksMinRefresh {
		return "", d.lastErr
	}
	d.lastTry = d.now()
	d.uri, d.lastErr = d.fetch(ctx)
	return d.uri, d.lastErr
}

func (d *discovery) fetch(ctx context.Context) (string, error) {
	// Sin la cancelación del request: si el cliente corta, la descarga sigue
	// (y sirve para los próximos requests).
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jwksFetchTimeout)
	defer cancel()
	wellKnown := strings.TrimSuffix(d.issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wellKnown, nil)
	if err != nil {
		return "", err
	}
	resp, err := d.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("discovery OIDC: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discovery OIDC: HTTP %d", resp.StatusCode)
	}
	var doc struct {
		Issuer  string `json:"issuer"`
		JWKSURI string `json:"jwks_uri"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, jwksMaxBytes)).Decode(&doc); err != nil {
		return "", fmt.Errorf("discovery OIDC: %w", err)
	}
	if doc.Issuer != d.issuer {
		return "", fmt.Errorf("discovery OIDC: issuer %q distinto al configurado %q", doc.Issuer, d.issuer)
	}
	u, err := url.Parse(doc.JWKSURI)
	if err != nil || u.Host == "" || (u.Scheme != "https" && !(d.allowHTTP && u.Scheme == "http")) {
		return "", fmt.Errorf("discovery OIDC: jwks_uri inválido %q", doc.JWKSURI)
	}
	return doc.JWKSURI, nil
}
