// Package telemetry arma el logger estructurado (log/slog de la stdlib).
// En producción JSON (Cloud Logging lo parsea: "level" -> severity); en
// desarrollo texto legible. Lo que se loguea y lo que no: middleware.AccessLog.
package telemetry

import (
	"io"
	"log/slog"
	"strings"
)

// NewLogger crea el logger. format: json | text. level: debug | info | warn | error.
func NewLogger(w io.Writer, format, level, service, env string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: lvl, ReplaceAttr: cloudLogging}
	var h slog.Handler
	if format == "json" {
		h = slog.NewJSONHandler(w, opts)
	} else {
		h = slog.NewTextHandler(w, opts)
	}
	return slog.New(h).With(slog.String("service", service), slog.String("env", env))
}

// cloudLogging renombra level -> severity y msg -> message (claves que Cloud
// Logging reconoce en logs JSON). En otros destinos no molesta.
func cloudLogging(groups []string, a slog.Attr) slog.Attr {
	if len(groups) > 0 {
		return a
	}
	switch a.Key {
	case slog.LevelKey:
		a.Key = "severity"
	case slog.MessageKey:
		a.Key = "message"
	}
	return a
}
