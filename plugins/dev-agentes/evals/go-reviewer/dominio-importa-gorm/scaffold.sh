#!/usr/bin/env bash
# Arma un repo con un commit base y el cambio a revisar sin commitear.
set -euo pipefail
git init -q -b main .
git config user.email eval@example.com && git config user.name eval
printf 'module example.com/orders-service\n\ngo 1.25\n' > go.mod
git add go.mod && git commit -qm base
mkdir -p "$(dirname 'app/domain/model/order.go')"
cat > 'app/domain/model/order.go' <<'GOEOF'
package model

import (
	"time"

	"gorm.io/gorm"
)

// Order es un pedido de un cliente.
type Order struct {
	ID         string `gorm:"primaryKey;type:uuid"`
	CustomerID string `gorm:"index"`
	TotalMinor int64  `gorm:"not null"`
	CreatedAt  time.Time
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}
GOEOF
