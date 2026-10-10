// Package upstream conecta el gateway con los servicios gRPC.
//
// Dirección por variable de entorno: UPSTREAM_<NAME>_ADDR (host:puerto).
// Seguridad del transporte (UPSTREAM_TLS / UPSTREAM_AUTH):
//
//   - Coolify / local: plaintext en la red interna de Docker (los servicios no
//     publican puertos). UPSTREAM_TLS=false, UPSTREAM_AUTH=none.
//   - Cloud Run: TLS + ID token de Google con audience = URL del servicio
//     (el servicio tiene --no-allow-unauthenticated y el SA del gateway es
//     roles/run.invoker). UPSTREAM_TLS=true, UPSTREAM_AUTH=google-idtoken.
package upstream

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"strings"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"google.golang.org/api/idtoken"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/credentials/oauth"
)

// Service es un servicio gRPC expuesto por REST.
type Service struct {
	Name        string // upstream: define UPSTREAM_<NAME>_ADDR
	GRPCService string // example.v1.ItemService
	Register    func(ctx context.Context, mux *runtime.ServeMux, conn *grpc.ClientConn) error
}

// Auth de los upstreams.
const (
	AuthNone          = "none"
	AuthGoogleIDToken = "google-idtoken"
)

// Config del transporte hacia los upstreams.
type Config struct {
	TLS  bool
	Auth string // AuthNone | AuthGoogleIDToken
}

// EnvName devuelve el nombre de la variable de entorno con el sufijo dado:
// EnvName("items", "ADDR") = UPSTREAM_ITEMS_ADDR.
func EnvName(name, suffix string) string {
	return "UPSTREAM_" + strings.ToUpper(strings.ReplaceAll(name, "-", "_")) + "_" + suffix
}

// Dial abre la conexión (lazy: grpc.NewClient no conecta hasta el primer
// RPC) al upstream name. getenv suele ser os.Getenv.
func Dial(ctx context.Context, cfg Config, name string, getenv func(string) string, extra ...grpc.DialOption) (*grpc.ClientConn, error) {
	addr := getenv(EnvName(name, "ADDR"))
	if addr == "" {
		return nil, fmt.Errorf("upstream %s: falta %s (host:puerto)", name, EnvName(name, "ADDR"))
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("upstream %s: %s=%q no es host:puerto", name, EnvName(name, "ADDR"), addr)
	}

	opts := append([]grpc.DialOption{}, extra...)
	switch {
	case cfg.TLS:
		opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12})))
	default:
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	switch cfg.Auth {
	case "", AuthNone:
	case AuthGoogleIDToken:
		if !cfg.TLS {
			return nil, errors.New("UPSTREAM_AUTH=google-idtoken exige UPSTREAM_TLS=true")
		}
		// Audience: la URL del servicio de Cloud Run (https://<host>), o la
		// que diga UPSTREAM_<NAME>_AUDIENCE.
		aud := getenv(EnvName(name, "AUDIENCE"))
		if aud == "" {
			aud = "https://" + host
		}
		// En Cloud Run idtoken usa el servidor de metadata (la identidad del
		// SA del servicio): sin claves JSON. Cachea y renueva el token solo.
		ts, err := idtoken.NewTokenSource(ctx, aud)
		if err != nil {
			return nil, fmt.Errorf("upstream %s: ID token para %s: %w", name, aud, err)
		}
		opts = append(opts, grpc.WithPerRPCCredentials(oauth.TokenSource{TokenSource: ts}))
	default:
		return nil, fmt.Errorf("UPSTREAM_AUTH=%q inválido (none | google-idtoken)", cfg.Auth)
	}

	conn, err := grpc.NewClient(addr, opts...)
	if err != nil {
		return nil, fmt.Errorf("upstream %s: %w", name, err)
	}
	return conn, nil
}
