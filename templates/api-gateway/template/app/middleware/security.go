package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders agrega las cabeceras de seguridad a TODAS las respuestas
// (incluidos errores y preflights). El gateway solo sirve JSON, así que la CSP
// puede ser la más cerrada. HSTS: TLS lo termina Cloud Run / Traefik, pero la
// cabecera la pone el gateway (los navegadores la ignoran por http plano).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		// Respuestas de API: nunca a cachés compartidas ni al disco del navegador.
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// IdentityHeaders son las cabeceras/metadata con las que el gateway informa la
// identidad a los servicios. Si vienen del cliente se BORRAN: solo las pone el
// gateway, después de verificar credenciales.
var IdentityHeaders = []string{"X-User-Id", "X-Roles", "X-Auth-Type", "X-Client-Ip"}

// StripSpoofable borra del request lo que un cliente no puede decidir:
// las cabeceras de identidad, cualquier Grpc-* (grpc-gateway convierte
// Grpc-Metadata-* en metadata gRPC) y Grpc-Timeout (el deadline lo fija la ruta).
func StripSpoofable(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, h := range IdentityHeaders {
			r.Header.Del(h)
		}
		for k := range r.Header {
			if strings.HasPrefix(strings.ToLower(k), "grpc-") {
				r.Header.Del(k)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// Chain aplica los middlewares en orden: Chain(h, a, b) = a(b(h)).
func Chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}
