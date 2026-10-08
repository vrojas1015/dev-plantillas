# Plantilla `go-grpc-service`

Plantilla [Copier](https://copier.readthedocs.io/) para microservicios Go gRPC
con arquitectura hexagonal, Postgres (GORM + pgx), `docker-compose.yml` para
desarrollo local, CI en GitLab o GitHub y deploy por tag de git a uno de estos
destinos (`deploy_target`):

- **`cloud-run`** (default): Cloud Build + Cloud Run + Cloud SQL, auth keyless
  (Workload Identity Federation, sin claves JSON).
- **`coolify`**: Coolify v4 en un VPS. La CI construye la imagen, la sube al
  registry del proveedor (GHCR / GitLab Container Registry) y dispara el deploy
  por la API de Coolify; Postgres corre en el mismo compose.
- **`ninguno`**: solo CI de tests.

La configuración es 12-factor e **idéntica entre destinos** (mismas variables de
entorno), así que un proyecto puede pasar de `coolify` a `cloud-run` con
`copier update` (ver "Cambiar de destino").

Este README y `copier.yml` son meta-archivos: **no** se copian al proyecto
generado. El contenido del proyecto vive en `template/` (`_subdirectory`).
Los archivos que terminan en `.jinja` se renderizan; el resto se copia tal cual.

## Qué genera

```
<service>-service/
├── cli/main.go                         # wiring + ciclo de vida (health, reflection, graceful stop)
├── app/
│   ├── domain/{model,port,errors}/     # entidades puras, ports, catálogo de errores (9 constructores + MapToGRPC)
│   ├── application/                    # use cases + tests stdlib (mocks = structs de funcs)
│   ├── adapters/grpc/{handler,mapper,interceptor}/
│   └── infra/{postgres,bootstrap,config,telemetry}/
├── proto/example/v1/item.proto         # contrato de ejemplo (entidad Item: Create/Get/List paginado)
├── gen/go/example/v1/                  # código generado del ejemplo (pre-generado; `make proto` lo regenera)
├── migrations/000001_create_<schema>_schema.{up,down}.sql
├── scripts/apply_migration.sh          # aplica un .up.sql (DATABASE_URL; prueba en seco + confirmación en prod)
├── scripts/migrate_db.sh               # copia el schema entre dos Postgres y verifica filas por tabla
├── scripts/compose-initdb.sh           # init del Postgres del compose local (aplica migrations/*.up.sql)
├── docker-compose.yml                  # local: app (Dockerfile) + postgres:16 con healthchecks
├── Dockerfile, .dockerignore, .gitignore, .env.example
├── .gitlab-ci.yml  |  .github/workflows/ci.yml (+ deploy.yml)   # según ci_provider
│   # solo deploy_target = cloud-run:
├── cloudbuild.yaml, cloudrun.qa.yaml, cloudrun.prod.yaml, .gcloudignore
├── scripts/{rollback,setup_cloud_run_secrets}.sh
├── docs/ci-cd-setup.md                 # setup de una sola vez (WIF, SA, tags protegidos, variables)
│   # solo deploy_target = coolify:
├── docker-compose.coolify.yml          # build pack "Docker Compose" de Coolify (imagen del registry)
├── docs/deploy.md                      # recurso, variables, dominio/gRPC, backups a S3 + restore
├── docs/migrar-a-cloud-run.md          # paso a paso coolify -> cloud-run
├── Makefile, buf.yaml, buf.gen.yaml, go.mod, go.sum
├── CLAUDE.md, .claude/settings.json
└── .copier-answers.yml                 # respuestas (lo usa `copier update`)
```

## Requisitos

- Python + `pip install copier` (>= 9.0; probado con 9.18.2)
- Go (la versión de `go_version`; con `GOTOOLCHAIN=auto` Go la descarga solo)
- Docker (compose local; `apply_migration.sh` / `migrate_db.sh` lo usan si no hay
  `psql` / `pg_dump` locales)
- Opcional: `buf` (solo para `make proto`), `gcloud` (cloud-run)

## Generar un proyecto

```bash
copier copy <origen-de-la-plantilla> ~/code/agenda-service
```

`<origen>` puede ser:

- una ruta local a esta carpeta (`C:/dev/dev-plantillas/templates/go-grpc-service`):
  sirve para `copy`, pero **no** para `update` (ver abajo);
- un repo git cuya **raíz** sea esta plantilla, con tags semver
  (`copier copy --vcs-ref v1.0.0 https://gitlab.com/mi-org/tpl-go-grpc-service.git ...`).

No interactivo:

```bash
copier copy --defaults \
  --data service_name=agenda \
  --data module_path=gitlab.com/mi-org/agenda-service \
  --data grpc_port=5015 \
  --data ci_provider=gitlab \
  --data deploy_target=cloud-run \
  --data gcp_project=mi-proyecto \
  <origen> ./agenda-service
```

Después:

```bash
cd agenda-service
go mod tidy && go build ./... && go vet ./... && go test ./...
git init && git add . && git add --chmod=+x scripts/*.sh && git commit -m "Scaffold inicial"
cp .env.example .env.dev && make up      # postgres:16 + servicio en Docker, espera healthy
```

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `service_name` | — | Nombre corto sin `-service` (`agenda` → `agenda-service`). Minúsculas/dígitos/guiones, máx. 19 (límite de 30 del service account `<nombre>-service-sa`) |
| `service_description` | `TODO…` | Primera sección de `CLAUDE.md` |
| `ci_provider` | `gitlab` | `gitlab` → `.gitlab-ci.yml`; `github` → `.github/workflows/ci.yml` + `deploy.yml` |
| `module_path` | `<gitlab.com\|github.com>/mi-org/<service>-service` | `module` de `go.mod` e imports |
| `grpc_port` | `5000` | `GRPC_PORT`, Dockerfile, compose, probes de Cloud Run |
| `db_schema` | `service_name` con `_` | Schema Postgres, `TableName()`, migraciones, usuario `<schema>_user` |
| `go_version` | `1.25.8` | `go.mod`, imagen `golang:<v>` del Dockerfile y de CI |
| `protos_module` | vacío | Módulo Go del repo de protos compartido (ver "Protos") |
| `protos_version` | `latest` | Solo si hay `protos_module`; aparece en la doc/`go get` |
| `deploy_target` | `cloud-run` | `cloud-run`, `coolify` o `ninguno` (ver "Destinos de deploy") |
| `gcp_project` | `mi-proyecto-gcp` | Solo `cloud-run`. Default de scripts y CI (la variable `GCP_PROJECT` de CI lo pisa) |
| `gcp_region` | `us-central1` | Solo `cloud-run`. Cloud Run + Artifact Registry |
| `artifact_repo` | `<service>-service` | Solo `cloud-run`. Repo de Artifact Registry |

Derivados (no se preguntan ni se guardan en `.copier-answers.yml`; se recalculan
en cada copy/update): `repo_name` = `<service_name>-service`,
`image_repo_default` (registry del proveedor de CI, para `coolify`) y los flags
de los nombres de archivo condicionales `is_cr`, `is_cy`, `has_cd`, `ci_gl`,
`ci_gh` (nombres cortos: Windows corta las rutas en 260 caracteres).

Lo que **no** es pregunta, a propósito: secretos, `DATABASE_URL`, audience/provider
de WIF, project number, emails de SA deployer, instancia de Cloud SQL, URL/token
de Coolify y UUIDs de recursos. Van como variables de CI, en Secret Manager o en
el panel de Coolify (ver `docs/ci-cd-setup.md` / `docs/deploy.md` del proyecto).

## Destinos de deploy

Configuración 12-factor: el código lee **todo** de variables de entorno
(`app/infra/config`) y son las mismas en todos los destinos:

| Variable | Local (`docker-compose.yml`) | Cloud Run (`cloudrun.<env>.yaml`) | Coolify (panel + `docker-compose.coolify.yml`) |
|---|---|---|---|
| `APP_ENV`, `SERVICE_ENV`, `DEBUG`, `LOG_LEVEL` | compose | yaml | panel (defaults = prod) |
| `GRPC_PORT` | compose | yaml | fijo en el compose |
| `DATABASE_URL` | compose (Postgres del compose) | Secret Manager (socket de Cloud SQL) | panel (Postgres del compose o externo) |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | compose | yaml | compose |

| | `cloud-run` | `coolify` | `ninguno` |
|---|---|---|---|
| CI en MR/PR | tests | tests | tests |
| Tag `qa-v*` / `prod-v*` | Cloud Build → Artifact Registry → `gcloud run services replace` | `docker build` → GHCR / GitLab Registry (tag inmutable + `qa`/`prod`) → `curl $COOLIFY_URL/api/v1/deploy?uuid=...` | — |
| Guarda de prod si el release toca `migrations/` | sí | sí | — |
| Health | probes gRPC de Cloud Run | `healthcheck` del compose (`<binario> healthcheck`) | — |
| Postgres | Cloud SQL | `postgres:16` en el compose, volumen persistente, backups a S3 (doc) | — |
| Rollback | `scripts/rollback.sh` | `IMAGE_TAG=<tag viejo>` en el panel + Redeploy | — |
| Setup | `docs/ci-cd-setup.md` | `docs/deploy.md` | — |

Healthcheck en compose: la imagen runtime es distroless (sin shell ni curl), así
que el binario tiene un subcomando `healthcheck` que consulta `grpc.health.v1`
en `127.0.0.1:$GRPC_PORT` (`cli/healthcheck.go`).

`docker-compose.yml` (siempre): app + `postgres:16`; las migraciones
`migrations/*.up.sql` las aplica `scripts/compose-initdb.sh`, montado en
`/docker-entrypoint-initdb.d`, **solo la primera vez que se inicializa el
volumen** (no se monta `migrations/` directo porque correría también los
`.down.sql`).

## Cambiar de destino (`coolify` → `cloud-run`)

Probado con Copier 9.18.2, en una rama y con el proyecto commiteado:

```bash
git switch -c migrar-cloud-run
copier update --defaults --data deploy_target=cloud-run \
  --data gcp_project=<id-proyecto> --data gcp_region=us-central1
```

En un proyecto sin modificaciones locales no hay conflictos: aparecen los
archivos de Cloud Run (`cloudbuild.yaml`, `cloudrun.*.yaml`, `.gcloudignore`,
`scripts/rollback.sh`, `scripts/setup_cloud_run_secrets.sh`,
`docs/ci-cd-setup.md`), desaparecen `docker-compose.coolify.yml`,
`docs/deploy.md` y `docs/migrar-a-cloud-run.md`, y cambian la CI, `CLAUDE.md`,
`.env.example` y comentarios de `docker-compose.yml`. El código Go no cambia y
el resultado es idéntico a generar el proyecto directamente con `cloud-run`.
Ojo: Copier borra los archivos que dejan de generarse **aunque tengan cambios
locales** (p. ej. variables propias en `docker-compose.coolify.yml`), sin
conflicto ni aviso; quedan en el historial de git para recuperarlas.

La migración de datos (`scripts/migrate_db.sh`), secretos, verificación en QA y
corte de prod están en `docs/migrar-a-cloud-run.md` del proyecto generado con
`coolify`.

El mismo mecanismo sirve para `ninguno` → cualquier destino.

## Protos: cómo se resolvió

Un servicio gRPC necesita código generado para compilar, y la plantilla no puede
adivinar los paquetes de un repo de protos externo. Por eso:

- **Siempre** se incluye un proto local mínimo, `proto/example/v1/item.proto`
  (`example.v1.ItemService`), con su código Go **pre-generado** en
  `gen/go/example/v1/`. El servicio compila, arranca y tiene tests sin red ni
  repos externos. El código generado no depende de `module_path` (se generó con
  un mapeo `M…` en vez de `go_package`), así que se copia tal cual.
- `make proto` (buf, plugins vía `go run` con versiones fijadas) regenera
  `gen/go` si editás el proto local.
- Si `protos_module` tiene valor, la plantilla **cablea la infraestructura** para
  el módulo privado: `GOPRIVATE` y acceso con token en CI, targets
  `make workspace`/`workspace-off` (go.work contra un checkout local), allowlist
  del token en la doc. **No** agrega el `require` a `go.mod` (`go mod tidy` lo
  borraría mientras nadie lo importe, y el scaffold no compilaría sin acceso al
  repo privado).

Para enchufar el repo de protos (ver también `CLAUDE.md` → "Protos"):

1. `go get <protos_module>@<versión>`
2. Handler que implemente el `XxxServiceServer` real (embebiendo
   `UnimplementedXxxServiceServer`), mapper, y registro en `cli/main.go`.
3. Borrar el ejemplo: entidad `Item` (archivos listados en `CLAUDE.md`),
   `proto/`, `gen/`, `buf.yaml`, `buf.gen.yaml`, tabla `items` de la migración.
4. Si no se había respondido `protos_module`: `copier update --data protos_module=…`
   para que aparezca el cableado de CI/Makefile.

## Actualizar un proyecto existente (`copier update`)

`copier update` aplica al proyecto los cambios de la plantilla entre la versión
con la que se generó (`_commit` en `.copier-answers.yml`) y la nueva, como un
merge de 3 vías. Requisitos:

- La plantilla tiene que venir de un **repo git cuya raíz sea la plantilla**, con
  tags. Copier no soporta "subcarpeta de un repo" como origen versionado: desde
  `dev-plantillas/templates/go-grpc-service` el `copy` funciona pero no se
  registra `_commit` y `update` falla. Opciones:
  - publicar esta carpeta como repo propio, p. ej. con
    `git subtree split --prefix templates/go-grpc-service -b tpl-go-grpc` y
    push de esa rama a `tpl-go-grpc-service` (+ tag `v1.0.0`);
  - o mantenerla directamente en un repo dedicado.
- El proyecto tiene que estar commiteado (working tree limpio).

```bash
cd agenda-service
copier update --vcs-ref v1.1.0            # o sin --vcs-ref: último tag
copier update --data grpc_port=5016       # cambiar una respuesta y re-renderizar
```

Los conflictos quedan como marcadores `<<<<<<<` (o `.rej`). Revisar con `git diff`
y correr `go build ./... && go test ./...` antes de commitear.

## Checklist post-generación

- [ ] `go mod tidy && go build ./... && go vet ./... && go test ./...` en verde
- [ ] Completar "Qué es este servicio" en `CLAUDE.md`; `cp .env.example .env.dev`; `make up`
- [ ] Crear el repo remoto (GitLab/GitHub) y push inicial; scripts con bit `+x`

### `coolify` (detalle en `docs/deploy.md`)

- [ ] `docker login` al registry en el VPS (token de solo lectura)
- [ ] Un recurso "Docker Compose" por entorno con `docker-compose.coolify.yml`, sin auto-deploy por push
- [ ] Variables del recurso: `IMAGE_TAG` (`qa`/`prod`), `POSTGRES_PASSWORD`, `DATABASE_URL`, `PG_LOCAL_PORT`, `APP_ENV`...
- [ ] Variables de CI: `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_RESOURCE_UUID_QA`, `COOLIFY_RESOURCE_UUID_PROD`
- [ ] Tags protegidos `prod-v*` / `qa-v*`
- [ ] Migraciones por túnel SSH (`scripts/apply_migration.sh`)
- [ ] Backups de Postgres a S3 **y una prueba de restore**

### `cloud-run` (infra GCP, manual; detalle en `docs/ci-cd-setup.md`)

- [ ] `scripts/setup_cloud_run_secrets.sh qa|prod`: SA runtime, roles, Artifact Registry, secreto `DATABASE_URL`
- [ ] Postgres: crear `<schema>_user`, aplicar `000001` (`DATABASE_URL=... scripts/apply_migration.sh`), grants
- [ ] SA deployer + roles (`cloudbuild.builds.editor`, `run.admin`, `storage.admin`,
      `artifactregistry.reader` sobre el repo, `iam.serviceAccountUser` sobre el SA runtime)
- [ ] WIF: sumar el repo al `attribute-condition` del provider (o crear pool/provider) y `workloadIdentityUser`
- [ ] Tags protegidos `prod-v*` / `qa-v*` (GitLab: Protected tags; GitHub: tag rulesets + environments)
- [ ] Variables de CI: `GCP_DEPLOYER_SA`, `GCP_WIF_AUD` (GitLab) o `GCP_WIF_PROVIDER` (GitHub), `CLOUD_SQL_INSTANCE`, opcional `GCP_PROJECT`
- [ ] Si hay `protos_module`: allowlist del `CI_JOB_TOKEN` (GitLab) o secret `PROTOS_TOKEN` (GitHub)
- [ ] `roles/run.invoker` sobre el servicio para quien lo llame (el servicio es interno)
- [ ] Primer release: `git tag qa-v0.1.0 && git push origin qa-v0.1.0`. El primer `prod-v*` va por override (no hay tag previo para la guarda)

## Mantener la plantilla

- Probar cambios generando en un directorio temporal con los 3 `deploy_target`
  × ambos `ci_provider`, con y sin `protos_module`, y correr
  `go build/vet/test` + `gofmt -l` en el resultado. Para el compose:
  `docker compose config` y `make up` (espera healthy).
- Archivos que dependen del destino: usar los flags cortos (`is_cr`, `is_cy`,
  `has_cd`, `ci_gl`, `ci_gh`) en el nombre, no la condición completa.
- `{{` en archivos `.jinja` que no deben renderizarse (p. ej. `${{ }}` de
  GitHub Actions, o literales Go anidados `[]T{{...}}`): envolver en
  `{% raw %}…{% endraw %}`. Ojo también con `{#` (comentario Jinja) en bash.
- Al subir versiones de dependencias: actualizar `template/go.mod.jinja` y
  `template/go.sum` desde un proyecto generado con `go mod tidy`.
- Versionar con tags semver en el repo publicado de la plantilla.
