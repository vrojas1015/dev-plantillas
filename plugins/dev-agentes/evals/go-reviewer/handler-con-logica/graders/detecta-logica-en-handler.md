---
type: llm
---

PASS sólo si la respuesta final señala los TRES problemas:
1. La regla de negocio del descuento (tope del 30% y el cálculo del total) está
   en el handler; debería estar en `app/application` (handlers finos).
2. El error de negocio se devuelve con `fmt.Errorf("...%w", ErrDiscountTooHigh)`
   en vez de un constructor de `domainerrors` (p. ej. `ValidationError` o
   `FailedPreconditionError`).
3. El error de `h.svc.Save` se devuelve crudo, sin `domainerrors.MapToGRPC`.
FAIL si falta alguno.
