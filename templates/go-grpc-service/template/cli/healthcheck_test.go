package main

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
)

func TestCheckHealth(t *testing.T) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	srv := grpc.NewServer()
	healthSrv := health.NewServer()
	grpc_health_v1.RegisterHealthServer(srv, healthSrv)
	go func() { _ = srv.Serve(lis) }()
	defer srv.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	healthSrv.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)
	if err := checkHealth(ctx, lis.Addr().String()); err != nil {
		t.Fatalf("SERVING: esperaba nil, got %v", err)
	}

	healthSrv.SetServingStatus("", grpc_health_v1.HealthCheckResponse_NOT_SERVING)
	if err := checkHealth(ctx, lis.Addr().String()); err == nil {
		t.Fatal("NOT_SERVING: esperaba error")
	}
}

func TestCheckHealthSinServidor(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	// Puerto reservado y cerrado: la conexión tiene que fallar.
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := lis.Addr().String()
	_ = lis.Close()

	if err := checkHealth(ctx, addr); err == nil {
		t.Fatal("esperaba error sin servidor")
	}
}
