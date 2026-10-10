# Plantilla `e2e-tests`

Plantilla [Copier](https://copier.readthedocs.io/) para el repo de **pruebas
de punta a punta** de la plataforma: prueba un ambiente desplegado (local con
docker compose, QA, prod) desde afuera, por la única puerta pública (el
gateway) y el front. Especificación: `docs/12-pruebas.md` del repo de
plantillas (§3 trazabilidad, §4 ambientes y datos, §5 inestables, §7 plantilla).

Este README y `copier.yml` no se copian al proyecto; el contenido vive en
`template/` (`_subdirectory`).

## Qué genera

```
<repo_name>/
├── playwright.config.ts            # proyectos api y web-<navegador>, cada uno con su gemelo "-inestable"
├── tests/
│   ├── api/                        # autorización por rol (401/403/200), flujo de ítems, smoke del gateway
│   ├── web/ + paginas/             # (web) flujos con Page Objects (selectores del front de angular-app)
│   └── fixtures/                   # test/expect con apiComo(rol), datos (prefijo + limpieza), ambiente; credenciales por auth
├── scripts/registro.ts             # reporte JSON de Playwright -> reportes/registro.json (esquemas/registro.schema.json)
├── scripts/suite.ts                # npm run e2e: Playwright + registro --bloquear (los @inestable no bloquean)
├── scripts/herramientas.ts, token.ts
├── robustez/                       # (robustez) Schemathesis por rol: robustez.ts + schemathesis.toml
├── carga/                          # (carga) k6: umbrales.js (p95, errores) y rate-limit.js (429 + Retry-After)
├── ambientes/<amb>.env.example     # URLs por ambiente; credenciales en <amb>.env (ignorado) o el CI
├── esquemas/registro.schema.json
├── docs/                           # usuarios-de-prueba, registro, disparo, ci, robustez-y-carga, ejemplos/ (disparo desde un servicio)
├── .github/workflows/{ci,e2e}.yml | .gitlab-ci.yml, plantilla de PR/MR
└── CLAUDE.md, README.md, .claude/settings.json, package.json, tsconfig.json
```

## Generar

```bash
copier copy --trust --defaults \
  -d auth=oidc -d ci_provider=github -d 'ambientes=[local, qa]' -d web=true \
  <origen-de-la-plantilla> ./e2e-tests
cd e2e-tests && npm install && npx playwright install chromium
npm run typecheck && npm run listar
```

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `repo_name`, `descripcion` | `e2e-tests` | package.json, README, CLAUDE.md |
| `ci_provider` | `gitlab` | `.gitlab-ci.yml` o `.github/workflows/` |
| `dueño` | `@mi-org/qa` | `CODEOWNERS` y `SECURITY.md` (`@usuario` o `@org/equipo`; base común, `docs/10` de dev-plantillas) |
| `docs_repo` | vacío | URL del repo de docs: la plantilla de MR/PR enlaza la carpeta del issue ahí |
| `ambientes` | `[local, qa]` | multiselect `local`/`qa`/`prod`: un `ambientes/<amb>.env.example` por cada uno; el CI ofrece los remotos. `prod` corre sólo `@smoke` y nunca robustez ni carga |
| `web` (+ `navegadores`) | `true` (`[chromium]`) | Proyectos web por navegador (`chromium`, `firefox`, `webkit`) y Page Objects |
| `api_base_url_<amb>`, `web_base_url_<amb>` | localhost / example.com | URL del gateway y del front por ambiente (sólo de los ambientes elegidos) |
| `api_gateway_openapi_url` | `/openapi.json` | Ruta relativa al API (`/…`, el gateway con `OPENAPI_ENABLED=true`), URL absoluta o archivo del repo |
| `auth` | `firebase` | `firebase` \| `oidc` \| `api-key` \| `ninguno`: cómo obtiene la suite el token de cada rol |
| `oidc_issuer`, `oidc_client_id` | — | Sólo oidc |
| `robustez` | `true` | Schemathesis |
| `carga` | `true` | k6 |

Derivados (no se guardan): `ci_gl`, `ci_gh`, `amb_local`, `amb_qa`,
`amb_prod`, `amb_ci` (ambientes remotos), `a_fb`, `a_oidc`, `a_key`, `a_none`,
`auth_header` y las versiones `v_*`. Nombres cortos para los archivos
condicionales (Windows corta las rutas en 260 caracteres).

## Tokens por rol (`auth`)

Un usuario de prueba por rol (`sin-rol`, `lector`, `escritor`, `admin`) más
`anonimo`, con credenciales **sólo** en variables de entorno
(`E2E_<ROL>_USUARIO`/`_CLAVE`, `E2E_<ROL>_API_KEY`, o `E2E_<ROL>_TOKEN` en
cualquier modo):

| `auth` | Cómo se obtiene el token |
|---|---|
| `firebase` | `accounts:signInWithPassword` de Identity Toolkit con email/clave (o el emulador) → ID token |
| `oidc` | `token_endpoint` del discovery de `OIDC_ISSUER`, grant `password` (usuario por rol) o `client_credentials` (cliente por rol); `OIDC_AUDIENCE`, `OIDC_CAMPO_TOKEN` para IdPs como Auth0 |
| `api-key` | La key de cada rol, en `X-API-Key` |
| `ninguno` | Sin credenciales: sólo rutas públicas |

Detalle en `template/docs/usuarios-de-prueba.md.jinja`.

## Decisiones

- **Playwright `1.64.0`** (TypeScript 7 sólo para `tsc --noEmit`; Node 24
  corre los `.ts` de `scripts/` con *type stripping*, sin `tsx`: por eso
  `erasableSyntaxOnly` e imports con extensión `.ts`).
- **`@inestable`**: cada proyecto tiene un gemelo `<proyecto>-inestable`
  (`grep`/`grepInvert`), así los tests en cuarentena corren y salen separados
  en el reporte. El código de salida de Playwright se ignora (`continue-on-error`
  en GitHub, `|| echo` en GitLab) y lo que bloquea lo decide
  `scripts/registro.ts --bloquear`: falla si falló un test que **no** es
  `@inestable`, si hay errores globales o si no corrió nada. Un test que pasa
  sólo al reintentar queda ⚠️ y se avisa.
- **Trazas/video/captura** sólo al fallar (`retain-on-failure`); **reintentos**
  sólo con `CI` (2).
- **Schemathesis `4.30.0`** por Docker (`schemathesis/schemathesis:4.30.0`) en
  local y en GitHub; en GitLab (runners sin Docker) con `uvx` (uv `0.13.0`).
  Así quien usa Node no necesita Python. Checks: `not_a_server_error`,
  `response_schema_conformance`, `content_type_conformance` y
  `max_response_time` (2 s). `status_code_conformance` apagado: el OpenAPI de
  grpc-gateway sólo documenta el 200 (verificado: cada 400/401/403/409/429
  correcto salía como "no documentado"). Credencial por variable de entorno
  (`headers` del toml con `${E2E_CREDENCIAL}`), nunca en la línea de comandos.
- **k6 `2.3.0`** por Docker (`grafana/k6:2.3.0`) o binario oficial fijado en
  GitLab. Umbrales `p95 < 500 ms` y `errores < 1 %` configurables por variable;
  el escenario de rate limit exige al menos un 429, todos con `Retry-After`, y
  ninguna respuesta que no sea 200/429.
- **CI completo** (el pipeline `e2e` del repo `ci` todavía no existe;
  docs/11): GitHub `ci.yml` (PR: typecheck + `--list`) y `e2e.yml`
  (`workflow_dispatch` con ambiente/suites/grep/origen, `repository_dispatch`
  tipo `e2e`, `schedule` nocturno y semanal con carga); GitLab con
  `workflow:rules` para `web|api|trigger|pipeline|schedule` y variables con
  `options`. Suites en serie (comparten rate limit) y una por ambiente a la vez.
  Artefactos: `reportes/` (HTML, JSON, JUnit, trazas) y `registro-e2e`.
- **Bloqueo de la promoción a prod**: el pipeline del servicio espera al e2e
  (GitLab: `trigger` con `strategy: depend`; GitHub: `gh workflow run` +
  `gh run watch --exit-status`, la corrida se encuentra por `run-name`).
  Ejemplos en `template/docs/ejemplos/`.
- **Limpieza**: prefijo `e2e-<corrida>` en todo lo creado
  (`datos.nombre()`), limpieza por test (`datos.alLimpiar`) y barrido por
  prefijo en `globalTeardown` (`LIMPIADORES`). El API de ejemplo no tiene
  DELETE: el limpiador de ítems sólo cuenta lo que quedó.
- **`registro.json`** (esquema en `template/esquemas/`): escenario → estado
  (✅ pasa, ❌ falla, ⚠️ inestable, 🔧 pendiente) → última corrida → enlace; lo
  lee la plantilla `docs` (`REGISTRO_E2E`) con el modelo pull de docs/10 §7.

## Verificar cambios en la plantilla

- CI del repo (job `e2e-tests` de `.github/workflows/templates.yml`): genera
  combinaciones de `auth` × CI × web, `npm install`, typecheck, `--list`,
  actionlint, y corre la suite `api` contra un gateway mínimo de prueba
  (`.github/e2e-tests/`) con un test `@inestable` que falla (no bloquea) y el
  registro validado contra el esquema.
- E2E completo (manual): protos (go, `http_gateway`) + `go-grpc-service` +
  Postgres + `api-gateway` (`auth=oidc` contra un emisor de prueba) + front
  `angular-app`, todo en docker compose; `npm run e2e`, `npm run robustez`
  con un handler que devuelve 500 sembrado, `npm run carga` con el umbral bajo.
- `copier update` necesita la plantilla en un repo git propio con tags PEP 440:
  `scripts/publish-template.sh e2e-tests vX.Y.Z <remote>`.

## Limitaciones

- El login **web** depende del front: los tests de ejemplo usan páginas
  públicas y preparan datos por API. Para flujos autenticados en el navegador,
  un Page Object de login del front (o `storageState` por rol).
- `oidc` con grant `password` requiere que el IdP lo permita para el cliente de
  pruebas (Keycloak/Auth0 sí; Entra ID no para cuentas con MFA): alternativa
  `client_credentials` o `E2E_<ROL>_TOKEN`.
- La robustez crea datos sin el prefijo de la suite (entradas generadas).
- GitHub: el `e2e.yml` disparado por otro repo es asíncrono; el bloqueo lo
  hace el job del servicio que espera (ejemplo incluido), no este repo.
