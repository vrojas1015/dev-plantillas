# <ORG> — Contexto de la plataforma

Este archivo vive en `C:\dev\<org>\` y lo lee toda sesión que arranque dentro de
la plataforma. Las reglas de cada stack están en `backend\CLAUDE.md` y
`frontend\CLAUDE.md`; las de cada repo, en su propio `CLAUDE.md`.

## Mapa

| Carpeta | Qué es |
|---|---|
| `backend\protos` | Contratos gRPC. Todo cambio de API empieza acá |
| `backend\api-gateway` | Única entrada HTTP pública |
| `backend\<dominio>-service` | Microservicios Go (gRPC, Postgres, un schema cada uno) |
| `frontend\<app>` | Apps Angular |
| `docs` | Issues, ADRs y runbooks. **Fuente de verdad** de qué hay que hacer y por qué |
| `tools` | Scripts y migraciones de datos |
| `worktrees\issue-<n>` | Donde se trabaja (ver abajo) |

<!-- Completar: dominios de negocio, quién consume a quién, ambientes (QA/prod) -->

## Cómo se trabaja

1. **Todo trabajo tiene un issue** en `docs\contenido\issues\<n>-<slug>\issue.md`
   (se crea con `make nuevo TIPO=issue` dentro de `docs`).
2. **Orden de un cambio que cruza capas:** protos → micro → api-gateway → front.
3. **Nunca se trabaja en la copia principal de un repo** (`backend\<repo>`):
   se queda en `main` y limpia. Se crea un worktree por repo tocado:
   ```powershell
   git -C backend\<repo> worktree add ..\..\worktrees\issue-<n>\<repo> -b feat/issue-<n>-<slug>
   ```
4. **Una sesión de agente por issue**, no por repo. La sesión trabaja sólo dentro
   de `worktrees\issue-<n>\`.
5. **Cada sesión escribe únicamente la carpeta de su issue** en `docs`
   (`contenido\issues\<n>-*\`). Los índices de `contenido\_generado\` los
   regenera `make generar` (o el CI); nadie los edita a mano.

## Terminado significa

- [ ] Tests en verde (`make test` / `npm run test:unit`) y build OK
- [ ] `/code-review` sin hallazgos abiertos
- [ ] Migraciones revisadas: up y down, sin `DEFAULT` que cambie el significado de datos existentes
- [ ] El issue dice qué se hizo y **cómo se probó** (archivo, test, comando)
- [ ] MR abierto con el template completo

## Convenciones

- Ramas: `feat/issue-<n>-<slug>`, `fix/issue-<n>-<slug>`.
- Commits: `<tipo>(issue-<n>): <qué cambia>`; el porqué largo va en el issue.
- Fechas siempre absolutas (`2026-10-08`).
- Nada de secretos en repos ni en `CLAUDE.md`: van en Secret Manager / variables de CI.
