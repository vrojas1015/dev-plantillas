---
type: llm
---

PASS si la respuesta final señala que `app/domain/model/order.go` importa
`gorm.io/gorm` y/o usa tags `gorm:` en el modelo de dominio, y lo explica como
una violación de la arquitectura hexagonal (el dominio no debe depender de
infraestructura; el mapeo a tabla va en un row struct de `app/infra/postgres`).
FAIL si no lo menciona, o si lo trata sólo como un tema de estilo.
