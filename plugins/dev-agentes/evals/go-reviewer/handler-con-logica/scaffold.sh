#!/usr/bin/env bash
# Arma un repo con un commit base y el cambio a revisar sin commitear.
set -euo pipefail
git init -q -b main .
git config user.email eval@example.com && git config user.name eval
printf 'module example.com/orders-service\n\ngo 1.25\n' > go.mod
git add go.mod && git commit -qm base
mkdir -p "$(dirname 'app/adapters/grpc/handler/order_handler.go')"
cat > 'app/adapters/grpc/handler/order_handler.go' <<'GOEOF'
package handler

import (
	"context"
	"errors"
	"fmt"

	"go.uber.org/zap"

	"example.com/orders-service/app/adapters/grpc/mapper"
	"example.com/orders-service/app/application"
	domainerrors "example.com/orders-service/app/domain/errors"
	ordersv1 "example.com/orders-service/gen/go/orders/v1"
)

var ErrDiscountTooHigh = errors.New("discount too high")

type OrderHandler struct {
	ordersv1.UnimplementedOrderServiceServer
	svc    *application.OrderService
	logger *zap.Logger
}

func (h *OrderHandler) ApplyDiscount(ctx context.Context, req *ordersv1.ApplyDiscountRequest) (*ordersv1.ApplyDiscountResponse, error) {
	order, err := h.svc.Get(ctx, req.GetOrderId())
	if err != nil {
		return nil, domainerrors.MapToGRPC(err, h.logger)
	}

	// Regla de negocio: el descuento no puede superar el 30% del total.
	if req.GetDiscountMinor()*100 > order.TotalMinor*30 {
		return nil, fmt.Errorf("apply discount: %w", ErrDiscountTooHigh)
	}
	order.TotalMinor -= req.GetDiscountMinor()

	if err := h.svc.Save(ctx, order); err != nil {
		return nil, err
	}
	return &ordersv1.ApplyDiscountResponse{Order: mapper.OrderToProto(order)}, nil
}
GOEOF
