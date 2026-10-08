#!/usr/bin/env bash
# Arma un repo con un commit base y el cambio a revisar sin commitear.
set -euo pipefail
git init -q -b main .
git config user.email eval@example.com && git config user.name eval
printf 'module example.com/orders-service\n\ngo 1.25\n' > go.mod
git add go.mod && git commit -qm base
mkdir -p "$(dirname 'app/application/order_service.go')"
cat > 'app/application/order_service.go' <<'GOEOF'
package application

import (
	"context"
	"strings"

	domainerrors "example.com/orders-service/app/domain/errors"
	"example.com/orders-service/app/domain/model"
	"example.com/orders-service/app/domain/port"
)

// maxDiscountPercent es el tope de descuento sobre el total del pedido.
const maxDiscountPercent = 30

type OrderService struct {
	repo port.OrderRepository
}

func NewOrderService(repo port.OrderRepository) *OrderService {
	return &OrderService{repo: repo}
}

// ApplyDiscount descuenta discountMinor del total, respetando el tope.
func (s *OrderService) ApplyDiscount(ctx context.Context, orderID string, discountMinor int64) (*model.Order, error) {
	if strings.TrimSpace(orderID) == "" {
		return nil, domainerrors.ValidationError("order_id is required", nil)
	}
	if discountMinor <= 0 {
		return nil, domainerrors.ValidationError("discount must be positive", map[string]any{"discount_minor": discountMinor})
	}

	order, err := s.repo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if discountMinor*100 > order.TotalMinor*maxDiscountPercent {
		return nil, domainerrors.FailedPreconditionError("discount exceeds the allowed maximum", map[string]any{
			"max_percent": maxDiscountPercent,
		})
	}

	order.TotalMinor -= discountMinor
	if err := s.repo.Update(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}
GOEOF
mkdir -p "$(dirname 'app/application/order_service_test.go')"
cat > 'app/application/order_service_test.go' <<'GOEOF'
package application

import (
	"context"
	"testing"

	domainerrors "example.com/orders-service/app/domain/errors"
	"example.com/orders-service/app/domain/model"
)

type mockOrderRepo struct {
	getByIDFn func(ctx context.Context, id string) (*model.Order, error)
	updateFn  func(ctx context.Context, o *model.Order) error
}

func (m *mockOrderRepo) GetByID(ctx context.Context, id string) (*model.Order, error) {
	if m.getByIDFn == nil {
		return nil, nil
	}
	return m.getByIDFn(ctx, id)
}

func (m *mockOrderRepo) Update(ctx context.Context, o *model.Order) error {
	if m.updateFn == nil {
		return nil
	}
	return m.updateFn(ctx, o)
}

func TestApplyDiscount_OK(t *testing.T) {
	repo := &mockOrderRepo{getByIDFn: func(context.Context, string) (*model.Order, error) {
		return &model.Order{ID: "o1", TotalMinor: 10_000}, nil
	}}
	got, err := NewOrderService(repo).ApplyDiscount(context.Background(), "o1", 2_000)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if got.TotalMinor != 8_000 {
		t.Errorf("TotalMinor = %d, want 8000", got.TotalMinor)
	}
}

func TestApplyDiscount_SuperaTope(t *testing.T) {
	repo := &mockOrderRepo{getByIDFn: func(context.Context, string) (*model.Order, error) {
		return &model.Order{ID: "o1", TotalMinor: 10_000}, nil
	}}
	_, err := NewOrderService(repo).ApplyDiscount(context.Background(), "o1", 3_001)
	if !domainerrors.IsFailedPrecondition(err) {
		t.Fatalf("err = %v, want FailedPrecondition", err)
	}
}

func TestApplyDiscount_Validaciones(t *testing.T) {
	svc := NewOrderService(&mockOrderRepo{})
	if _, err := svc.ApplyDiscount(context.Background(), " ", 100); !domainerrors.IsValidation(err) {
		t.Errorf("order_id vacío: err = %v, want Validation", err)
	}
	if _, err := svc.ApplyDiscount(context.Background(), "o1", 0); !domainerrors.IsValidation(err) {
		t.Errorf("descuento 0: err = %v, want Validation", err)
	}
}
GOEOF
