# Plantilla `api-gateway`

Plantilla [Copier](https://copier.readthedocs.io/) para el **API gateway**: la
única puerta pública de la plataforma. Expone por REST/JSON los servicios gRPC
con [grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) (rutas desde
las anotaciones `google.api.http` de los `.proto`) y concentra los controles
de seguridad comunes. Diseño y criterios: `docs/05-api-gateway.md` del repo de
plantillas. Esta es la **fase 1** (REST + auth + autorización por ruta + rate
limit en memoria + límites + CORS/cabeceras + errores + logs + tests de
autorización); `protovalidate`, Redis, GraphQL y SOAP son fases siguientes.

Este README y `copier.yml` no se copian al proyecto; el contenido vive en
`template/` (`_subdirectory`).

## Qué genera

```
<repo_name>/
├── cli/main.go, healthcheck.go, [apikey.go]   # wiring; `<bin> healthcheck` (distroless); `<bin> apikey` (auth=api-key)
├── routes.yaml                                 # autorización por ruta, DENEGAR POR DEFECTO
├── app/
│   ├── upstream/registry.go                    # servicios gRPC expuestos (UPSTREAM_<NAME>_ADDR)
│   ├── upstream/upstream.go                    # dial: plaintext interno o TLS + ID token de Google
│   ├── gateway/                                # mux grpc-gateway + middleware de ruta, errores, interceptor, builtins
│   │   └── *_test.go                           # tests de autorización GENERADOS desde routes.yaml + pipeline
│   ├── middleware/                             # request-id, access log redactado, recover, cabeceras, CORS, limpieza
│   ├── auth/ (+ authtest/)                     # JWT Firebase/OIDC (JWKS en caché), API keys SHA-256; emisor de prueba
│   ├── routes/ ratelimit/ config/ reqctx/ apierror/ telemetry/
├── proto/example/v1/item.proto, buf.*          # ejemplo local (= ItemService de go-grpc-service/protos) con google.api.http
├── gen/go/example/v1/ (pb, grpc, pb.gw)        # pre-generado; gen/openapi/ (api.swagger.json embebido)
├── Dockerfile (distroless por digest), .dockerignore, docker-compose.yml
├── .gitlab-ci.yml | .github/workflows/ci.yml (+ deploy.yml), plantilla de MR/PR
│   # cloud-run: cloudbuild.yaml, cloudrun.{qa,prod}.yaml, .gcloudignore, scripts/{setup_cloud_run,rollback}.sh, docs/ci-cd-setup.md
│   # coolify:   docker-compose.coolify.yml, docs/deploy.md
├── docs/auth.md (según proveedor), docs/rutas.md
├── Makefile (run, test, lint, vuln, image, scan, up...), .env.example, go.mod, go.sum
└── CLAUDE.md, .claude/settings.json, .copier-answers.yml
```

## Generar

```bash
copier copy --defaults \
  --data auth=firebase --data firebase_project=mi-proyecto \
  --data ci_provider=gitlab --data deploy_target=cloud-run --data gcp_project=mi-proyecto \
  --data protos_module=gitlab.com/mi-org/protos \
  <origen-de-la-plantilla> ./api-gateway
cd api-gateway && go build ./... && go test ./...
```

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `repo_name` | `api-gateway` | Repo, binario, servicio (máx. 27: SA `<nombre>-sa`) |
| `service_description` | texto | `CLAUDE.md` |
| `ci_provider` | `gitlab` | `.gitlab-ci.yml` o `.github/workflows/` |
| `module_path` | `<host>/mi-org/<repo_name>` | `go.mod` |
| `http_port` | `8080` | `HTTP_PORT`, Dockerfile, probes |
| `go_version` | `1.26.9` | ≥ 1.26 (grpc-gateway v2.31) |
| `protos_module` (+ `protos_version`) | vacío | Repo de protos (plantilla `protos`, `http_gateway=true`): cablea `GOPRIVATE`, token en CI y `make workspace`. El cambio de imports es manual (ver CLAUDE.md del proyecto) |
| `auth` | `firebase` | `firebase` \| `oidc` \| `api-key` \| `ninguno` |
| `firebase_project` | — | Solo firebase: default de `FIREBASE_PROJECT_ID` |
| `oidc_issuer`, `oidc_audience` | — | Solo oidc (issuer https) |
| `deploy_target` | `cloud-run` | `cloud-run` \| `coolify` \| `ninguno` |
| `gcp_project`, `gcp_region`, `artifact_repo` | — | Solo cloud-run |

Derivados (no se guardan): `image_repo_default`, `is_cr`, `is_cy`, `has_cd`,
`ci_gl`, `ci_gh`, `a_fb`, `a_oidc`, `a_jwt`, `a_key`, `a_none` (nombres cortos
para los archivos condicionales: Windows corta las rutas en 260 caracteres).

**`rate_limit_store` no se pregunta en la fase 1**: el único almacenamiento es
memoria (token bucket por instancia, interfaz `ratelimit.Limiter`). La fase 3
agrega la pregunta con `memory | redis` y default `memory`, así un `copier
update` no cambia nada a quien no la elija. En Cloud Run el límite real es
límite × instancias (`maxScale`; lo dicen `cloudrun.*.yaml` y `docs/rutas.md`).

## Decisiones

- **Dónde se genera el código REST**: en el **repo de protos** (plantilla
  `protos`, `http_gateway=true`): plugins remotos `grpc-ecosystem/gateway` y
  `openapiv2` junto al resto del código Go, dep `buf.build/googleapis/googleapis`
  fijada en `buf.lock`. El gateway solo importa `RegisterXxxHandler` y
  `openapi.Spec`; no necesita buf. Para compilar y testear sin repo externo, la
  plantilla trae el ejemplo local pre-generado (mismo patrón que
  `go-grpc-service`); pasar al repo de protos = cambiar dos imports y borrar
  `proto/`, `gen/`, `buf.*` (probado en el E2E).
- **routes.yaml** con clave = método gRPC (`example.v1.ItemService/GetItem`),
  exactamente una de `public: true` / `roles: [...]` (alcanza uno) / `deny:
  true`, más `timeout`, `max_body_bytes`, `rate_limit` (bucket propio) y
  `sunset`. Parseo estricto (campo desconocido = error).
- **Cómo se resuelve la ruta**: middleware del `runtime.ServeMux`
  (`WithMiddlewares`) que lee el patrón que matcheó (`runtime.HTTPPattern`) y lo
  mapea al método gRPC con las anotaciones leídas del registro de protobuf. Un
  test compara la normalización contra el parser real del mux, y el
  interceptor gRPC rechaza cualquier llamada a un método distinto del
  autorizado (defensa en profundidad).
- **Política de rutas no declaradas**: método anotado sin entrada → **404** +
  warning al arrancar + falla `TestRutasDeLaTablaExisten` en CI. Entrada de un
  método inexistente o sin `google.api.http`, roles con `auth=ninguno`, o
  `timeout` ≥ `HTTP_WRITE_TIMEOUT` → el gateway **no arranca**.
- **Metadata hacia los servicios**: se arma desde cero en el interceptor
  (`x-request-id`, `x-user-id`, `x-roles`, `x-auth-type`, `x-client-ip`). Ninguna
  cabecera del cliente pasa (grpc-gateway reenvía `Authorization` por
  compatibilidad: acá no), y `X-User-Id`/`X-Roles`/`Grpc-*` se borran al entrar.
- **Auth**: el código de los tres verificadores vive siempre en `app/auth` (con
  tests); la respuesta `auth` decide el wiring (`cli/main.go`), los tests de
  rutas y la doc. JWT con go-jose v4: algoritmos RS256/ES256, iss/aud/exp/nbf/iat
  con tolerancia ≤ 60 s, JWKS en caché (Cache-Control, 1 min–24 h) con refresco
  por `kid` desconocido limitado a uno cada 30 s y backoff si el IdP falla.
  Firebase: JWKS `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
  (verificado: responde JWK RS256 con `max-age`). API keys: `gwk_` + 256 bits,
  SHA-256 en config/secret, scopes y vencimiento.
- **Upstreams en Cloud Run**: TLS + ID token por audiencia con
  `google.golang.org/api/idtoken` (servidor de metadata, sin claves). En
  Coolify/local: plaintext en la red interna.
- **Logs** con `log/slog` (JSON en prod, claves `severity`/`message` para Cloud
  Logging); sin query strings ni cuerpos; cabeceras solo en debug y redactadas.
- **CI**: test + gofmt + vet + govulncheck; imagen + Trivy oficial fijado
  (`aquasec/trivy:0.74.0`, `--severity HIGH,CRITICAL --ignore-unfixed`; sin
  `trivy-action`). En Coolify se publica **la misma imagen escaneada**; en
  Cloud Run se mantiene Cloud Build (patrón de `go-grpc-service`) con el mismo
  commit, `vendor/` y Dockerfile. Sin guarda de migraciones (el gateway no
  tiene base).

## Verificar cambios en la plantilla

- Generar las 4 auth × ambos CI × los 3 destinos (CI del repo: job
  `api-gateway` de `.github/workflows/templates.yml`) y correr `go mod tidy
  -diff`, `go build/vet/test`, `gofmt -l`, `govulncheck`; `actionlint` sobre
  los workflows generados.
- `make scan` en un proyecto generado (Trivy sobre la imagen).
- E2E: repo `protos` (go, `http_gateway=true`) + un `go-grpc-service` con ese
  ItemService + Postgres + el gateway (`auth=oidc`) contra un emisor JWT de
  prueba, todo en docker compose; curl de cada criterio de la §9 de docs/05.
- `copier update` necesita la plantilla en un repo git propio con tags PEP 440
  (`v0.0.1`, no `v0.0.0-ci`): `scripts/publish-template.sh api-gateway vX.Y.Z <remote>`.

## Limitaciones (fase 1)

- Rate limit solo en memoria (por instancia). Sin circuit breaker por servicio
  (solo deadline por llamada); sin `protovalidate` (fase 2).
- Una sola forma de auth por gateway (no Firebase + API keys a la vez).
- Las rutas con `additional_bindings` y verbos custom están soportadas por el
  mapeo, pero el ejemplo y los tests generados solo cubren GET/POST.
- En Cloud Run, `UPSTREAM_<NAME>_ADDR` de `cloudrun.*.yaml` se completa a mano
  (la URL del servicio depende del número de proyecto).
- Los nombres de menú de Coolify cambian entre versiones de v4 (`docs/deploy.md`
  describe qué configurar).
