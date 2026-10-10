## Qué cambia

<!-- Una o dos líneas. Referenciá el issue: Closes #<n> -->

## Cómo se probó

- [ ] `go build ./... && go vet ./...`
- [ ] `go test -count=1 ./...` (incluye los tests de autorización generados desde `routes.yaml`)
- [ ] `make vuln` (govulncheck) y, si cambian dependencias o el Dockerfile, `make scan` (Trivy)

## Rutas y seguridad

- [ ] No toca rutas ni `routes.yaml`
- [ ] Ruta nueva o cambiada: la anotación `google.api.http` está en el repo de protos (link al MR), la entrada de `routes.yaml` declara `public`, `roles` o `deny` a propósito, y el `rate_limit`/`max_body_bytes` es el adecuado
- [ ] Una ruta pública nueva está justificada abajo
- [ ] Cambia auth, CORS, cabeceras o límites: explicado abajo

## Notas para el review

<!-- Decisiones, deuda que queda, cambios de protos relacionados (link al MR). -->
