package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

// healthcheckCmd es el subcomando que usa el HEALTHCHECK de docker compose
// (local y Coolify): `<binario> healthcheck`. La imagen runtime es distroless
// (sin shell ni curl), así que el propio binario consulta GET /healthz en
// 127.0.0.1:$HTTP_PORT. Cloud Run usa sus probes HTTP nativos contra el mismo
// endpoint (cloudrun.*.yaml).
const healthcheckCmd = "healthcheck"

// runHealthcheck devuelve el exit code: 0 si /healthz responde 200.
func runHealthcheck(defaultPort int) int {
	port := defaultPort
	if v, err := strconv.Atoi(os.Getenv("HTTP_PORT")); err == nil {
		port = v
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := checkHealth(ctx, fmt.Sprintf("http://127.0.0.1:%d/healthz", port)); err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	return 0
}

func checkHealth(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}
