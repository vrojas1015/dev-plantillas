# Backend — Convenciones comunes

Aplica a todo repo bajo `backend\`. El `CLAUDE.md` de cada micro sólo agrega lo
propio (puerto, schema, entidades, particularidades).

## Arquitectura (hexagonal)

```
adapters → application → domain ← infra
                         (ports)
```

| Capa | Path | Regla |
|---|---|---|
| Domain | `app/domain/model` | Entidades puras: sin tags de GORM ni imports de proto |
| Ports | `app/domain/port` | Interfaces de repositorio |
| Errors | `app/domain/errors` | `DomainError` + constructores; alias `domainerrors` |
| Application | `app/application` | Use cases; sólo dependen de ports |
| Handler | `app/adapters/grpc/handler` | Fino: mapper → service → `MapToGRPC`. Sin lógica |
| Mapper | `app/adapters/grpc/mapper` | Única frontera proto ↔ domain |
| Repos | `app/infra/postgres` | Row structs privados, `TableName()` con schema |
| Entry point | `cli/main.go` | Sólo wiring y lifecycle |

## Errores

- Siempre los constructores de `domainerrors` (`NotFoundError`, `ValidationError`, ...).
  Nunca `fmt.Errorf("%w", sentinel)`.
- `gorm.ErrRecordNotFound` → `NotFoundError`; PG `23505` → `ConflictError`;
  el resto → `InternalError("...", map[string]any{"cause": err.Error()})`.

## Tests

- Sólo stdlib `testing`. Sin testify ni generadores de mocks.
- Mocks = structs con campos `func`. Cada método público de un service: caso feliz,
  validaciones y propagación de errores del repo.

## Protos

- Cambio de contrato = MR en `protos` + release `vX.Y.Z` → bump en el micro.
- Para co-desarrollar: `make workspace` (crea `go.work`, no se commitea);
  `make workspace-off` antes de pushear.
- En el mapper, campos `optional` se leen con el puntero, no con `GetX()`
  (que aplasta «ausente» en el valor cero).

## Migraciones

- `migrations/NNNNNN_<qué>.{up,down}.sql`, numeradas, siempre con `down`.
- Columna nueva que significa «no revisado todavía» → `NULL` sin `DEFAULT`.
- Un release que toca `migrations/` no se despliega solo a prod: se aplica el SQL
  a mano y se lanza el job de override (ver `docs/ci-cd-setup.md` del repo).

## Deploy

- Tag `qa-vX.Y.Z` → QA automático. Tag `prod-vX.Y.Z` → prod.
- Rollback: `scripts/rollback.sh <tag>` (redespliega una imagen existente, no reconstruye).

## Comandos

```bash
make run | make build | make test | make vet
go build ./... && go vet ./... && go test -count=1 ./...
```
