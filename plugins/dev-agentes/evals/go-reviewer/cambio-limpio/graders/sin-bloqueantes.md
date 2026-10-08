---
type: llm
---

El cambio respeta las reglas del servicio: lógica en `application`, errores con
constructores de `domainerrors`, tests con stdlib y mocks de campos `func`.
PASS si la respuesta final no reporta ningún problema como bloqueante o grave
(puede hacer observaciones menores u opcionales, o decir que no encontró
problemas). FAIL si reporta como bloqueante o grave algo que no es un problema
real, por ejemplo pedir testify o mover la lógica al handler.
