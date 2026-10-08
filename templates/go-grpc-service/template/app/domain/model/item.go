package model

import "time"

// Item es la entidad de EJEMPLO de la plantilla: muestra el patrón completo
// (model -> port -> application -> postgres -> mapper -> handler). Borrala
// junto con sus piezas cuando agregues las entidades reales del servicio.
//
// Regla: el dominio es Go puro. Sin tags de GORM, sin tipos de proto.
type Item struct {
	ID          string
	Name        string
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
