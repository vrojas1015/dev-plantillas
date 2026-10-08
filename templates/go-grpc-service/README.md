# Plantilla `go-grpc-service`

Plantilla [Copier](https://copier.readthedocs.io/) para microservicios Go gRPC
con arquitectura hexagonal, Postgres (GORM + pgx), deploy a Cloud Run por tag
de git (Cloud Build + Workload Identity Federation, sin claves JSON) y CI en
GitLab o GitHub.

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
├── scripts/{rollback,setup_cloud_run_secrets,apply_migration}.sh
├── docs/ci-cd-setup.md                 # setup de una sola vez (WIF, SA, tags protegidos, variables)
├── Dockerfile, .dockerignore, .gcloudignore, .gitignore, .env.example
├── cloudbuild.yaml, cloudrun.qa.yaml, cloudrun.prod.yaml
├── .gitlab-ci.yml  |  .github/workflows/{ci,deploy}.yml   # según ci_provider
├── Makefile, buf.yaml, buf.gen.yaml, go.mod, go.sum
├── CLAUDE.md, .claude/settings.json
└── .copier-answers.yml                 # respuestas (lo usa `copier update`)
```

## Requisitos

- Python + `pip install copier` (>= 9.0; probado con 9.18.2)
- Go (la versión de `go_version`; con `GOTOOLCHAIN=auto` Go la descarga solo)
- Opcional: `buf` (solo para `make proto`), Docker (para `apply_migration.sh`), `gcloud`

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
  --data gcp_project=mi-proyecto \
  --data ci_provider=gitlab \
  <origen> ./agenda-service
```

Después:

```bash
cd agenda-service
go mod tidy && go build ./... && go vet ./... && go test ./...
git init && git add . && git add --chmod=+x scripts/*.sh && git commit -m "Scaffold inicial"
```

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `service_name` | — | Nombre corto sin `-service` (`agenda` → `agenda-service`). Minúsculas/dígitos/guiones, máx. 19 (límite de 30 del service account `<nombre>-service-sa`) |
| `service_description` | `TODO…` | Primera sección de `CLAUDE.md` |
| `ci_provider` | `gitlab` | `gitlab` → `.gitlab-ci.yml`; `github` → `.github/workflows/ci.yml` + `deploy.yml` |
| `module_path` | `<gitlab.com\|github.com>/mi-org/<service>-service` | `module` de `go.mod` e imports |
| `grpc_port` | `5000` | `GRPC_PORT`, `containerPort`, probes, Dockerfile |
| `db_schema` | `service_name` con `_` | Schema Postgres, `TableName()`, migraciones, usuario `<schema>_user` |
| `go_version` | `1.25.8` | `go.mod`, imagen `golang:<v>` del Dockerfile y de CI |
| `protos_module` | vacío | Módulo Go del repo de protos compartido (ver "Protos") |
| `protos_version` | `latest` | Solo si hay `protos_module`; aparece en la doc/`go get` |
| `gcp_project` | `mi-proyecto-gcp` | Default de scripts y CI (la variable `GCP_PROJECT` de CI lo pisa) |
| `gcp_region` | `us-central1` | Cloud Run + Artifact Registry |
| `artifact_repo` | `<service>-service` | Repo de Artifact Registry |

Derivados (no se preguntan): `repo_name` = `<service_name>-service`.

Lo que **no** es pregunta, a propósito: secretos, `DATABASE_URL`, audience/provider
de WIF, project number, emails de SA deployer, instancia de Cloud SQL. Van como
variables de CI o en Secret Manager (ver `docs/ci-cd-setup.md` del proyecto generado).

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

## Checklist post-generación (infra GCP, manual)

Detalle y comandos en `docs/ci-cd-setup.md` del proyecto generado.

- [ ] `go mod tidy && go build ./... && go vet ./... && go test ./...` en verde
- [ ] Completar "Qué es este servicio" en `CLAUDE.md`; `cp .env.example .env.dev`
- [ ] Crear el repo remoto (GitLab/GitHub) y push inicial; scripts con bit `+x`
- [ ] `scripts/setup_cloud_run_secrets.sh qa|prod`: SA runtime, roles, Artifact Registry, secreto `DATABASE_URL`
- [ ] Postgres: crear `<schema>_user`, aplicar `000001` (`scripts/apply_migration.sh`), grants
- [ ] SA deployer + roles (`cloudbuild.builds.editor`, `run.admin`, `storage.admin`,
      `artifactregistry.reader` sobre el repo, `iam.serviceAccountUser` sobre el SA runtime)
- [ ] WIF: sumar el repo al `attribute-condition` del provider (o crear pool/provider) y `workloadIdentityUser`
- [ ] Tags protegidos `prod-v*` / `qa-v*` (GitLab: Protected tags; GitHub: tag rulesets + environments)
- [ ] Variables de CI: `GCP_DEPLOYER_SA`, `GCP_WIF_AUD` (GitLab) o `GCP_WIF_PROVIDER` (GitHub), `CLOUD_SQL_INSTANCE`, opcional `GCP_PROJECT`
- [ ] Si hay `protos_module`: allowlist del `CI_JOB_TOKEN` (GitLab) o secret `PROTOS_TOKEN` (GitHub)
- [ ] `roles/run.invoker` sobre el servicio para quien lo llame (el servicio es interno)
- [ ] Primer release: `git tag qa-v0.1.0 && git push origin qa-v0.1.0`. El primer `prod-v*` va por override (no hay tag previo para la guarda)

## Mantener la plantilla

- Probar cambios generando en un directorio temporal con ambos `ci_provider`,
  con y sin `protos_module`, y correr `go build/vet/test` en el resultado.
- `{{` en archivos `.jinja` que no deben renderizarse (p. ej. `${{ }}` de
  GitHub Actions, o literales Go anidados `[]T{{...}}`): envolver en
  `{% raw %}…{% endraw %}`. Ojo también con `{#` (comentario Jinja) en bash.
- Al subir versiones de dependencias: actualizar `template/go.mod.jinja` y
  `template/go.sum` desde un proyecto generado con `go mod tidy`.
- Versionar con tags semver en el repo publicado de la plantilla.
