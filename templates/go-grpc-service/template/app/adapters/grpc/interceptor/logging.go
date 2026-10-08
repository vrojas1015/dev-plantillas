package interceptor

import (
	"context"
	"strings"
	"time"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

// healthMethodPrefix: los probes de Cloud Run pegan cada pocos segundos; no
// ensuciamos el log con ellos salvo que fallen.
const healthMethodPrefix = "/grpc.health.v1.Health/"

// UnaryLogger retorna un interceptor que loguea cada petición gRPC unaria.
// Con debug=true también loguea el payload del request y la respuesta.
func UnaryLogger(logger *zap.Logger, debug bool) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		start := time.Now()

		if debug {
			logger.Debug("gRPC request received",
				zap.String("method", info.FullMethod),
				zap.Any("request", req),
			)
		}

		resp, err := handler(ctx, req)

		code := codes.OK
		if err != nil {
			code = status.Code(err)
		}

		fields := []zap.Field{
			zap.String("method", info.FullMethod),
			zap.String("code", code.String()),
			zap.Duration("duration", time.Since(start)),
		}

		if p, ok := peer.FromContext(ctx); ok {
			fields = append(fields, zap.String("peer", p.Addr.String()))
		}

		switch {
		case err != nil:
			fields = append(fields, zap.Error(err))
			logger.Warn("gRPC request", fields...)
		case strings.HasPrefix(info.FullMethod, healthMethodPrefix):
			// health check OK: silencio
		default:
			if debug {
				fields = append(fields, zap.Any("response", resp))
			}
			logger.Info("gRPC request", fields...)
		}

		return resp, err
	}
}
