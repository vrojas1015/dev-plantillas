package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health/grpc_health_v1"
)

// healthcheckCmd es el subcomando que usa el HEALTHCHECK de docker compose
// (local y Coolify): `<binario> healthcheck`. La imagen runtime es distroless
// (sin shell, curl ni grpc_health_probe), así que el propio binario hace de
// cliente de grpc.health.v1 contra localhost:$GRPC_PORT.
//
// Cloud Run no lo usa: sus probes gRPC nativos (cloudrun.*.yaml) consultan el
// mismo servicio de health.
const healthcheckCmd = "healthcheck"

// runHealthcheck devuelve el exit code: 0 si el servicio responde SERVING.
// No carga config ni abre la base: solo necesita GRPC_PORT.
func runHealthcheck(defaultPort int) int {
	port := defaultPort
	if v, err := strconv.Atoi(os.Getenv("GRPC_PORT")); err == nil {
		port = v
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := checkHealth(ctx, fmt.Sprintf("127.0.0.1:%d", port)); err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	return 0
}

// checkHealth consulta grpc.health.v1 (servicio "") en addr.
func checkHealth(ctx context.Context, addr string) error {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	defer conn.Close()

	resp, err := grpc_health_v1.NewHealthClient(conn).Check(ctx, &grpc_health_v1.HealthCheckRequest{})
	if err != nil {
		return err
	}
	if resp.GetStatus() != grpc_health_v1.HealthCheckResponse_SERVING {
		return fmt.Errorf("status %s", resp.GetStatus())
	}
	return nil
}
