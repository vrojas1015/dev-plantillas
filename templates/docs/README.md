# Plantilla `docs`

Plantilla [Copier](https://copier.readthedocs.io/) para el **repo central de
documentación** de una plataforma: issues (uno por carpeta), ADRs, fichas de
servicios, runbooks, postmortems, casos de uso y releases, con frontmatter
validado por JSON Schema, índices **generados** y sitio
[MkDocs Material](https://squidfunk.github.io/mkdocs-material/). Todo en
español. Especificación: `docs/06-documentacion.md` de este repo.

Este README y `copier.yml` son meta-archivos: **no** se copian al repo
generado. El contenido vive en `template/` (`_subdirectory`); los `.jinja` se
renderizan y el resto se copia tal cual.

## Qué genera

```text
docs/
├── mkdocs.yml                     # docs_dir: contenido, strict, Mermaid, búsqueda, modo oscuro, hook
├── Makefile                       # nuevo, validar, generar, servir, construir (+ instalar)
├── requirements.txt               # versiones fijas
├── CLAUDE.md, .claude/settings.json, README.md
├── esquemas/*.schema.json         # issue, plan, adr, servicio, runbook, postmortem, release
├── scripts/                       # nuevo.py, validar.py, generar.py, hook_mkdocs.py, comun.py
├── _plantillas/                   # issue, plan, adr, runbook, postmortem, release, servicio
├── contenido/
│   ├── index.md, estilos/extra.css
│   ├── plataforma/                # índice, arquitectura (Mermaid), ambientes, glosario, cómo documentar
│   ├── servicios/<repo>.md        # una ficha por cada repos_iniciales
│   ├── issues/001-issue-de-ejemplo/{issue,plan}.md
│   ├── adr/0001-registrar-decisiones-de-arquitectura.md
│   ├── runbooks/ postmortems/ casos-de-uso/ releases/   # con su index.md
│   ├── _generado/                 # issues-por-estado, issues-por-repo, adr, servicios, rollout
│   └── .obsidian/                 # obsidian: app.json + core-plugins.json
├── .markdownlint-cli2.yaml, lychee.toml
├── .gitlab-ci.yml + MR template | .github/workflows/ci.yml + PR template
├── firebase-hosting: firebase.json, .firebaserc, deploy (GitHub: workflow aparte)
└── coolify: Dockerfile, caddy/{Caddyfile,auth.caddy.ejemplo,entrypoint.sh}, docker-compose.yml, .dockerignore
```

## Requisitos

- Python 3.10+ y `pip install copier` (>= 9.3 por `{% yield %}` en nombres de
  archivo; probado con 9.18.2).
- En el repo generado: Python + `pip install -r requirements.txt`, `make`
  (Windows: desde Git Bash) y Node o Docker para markdownlint.

## Generar

```bash
copier copy --defaults \
  --data org_name=mi-org \
  --data 'repos_iniciales=[protos, api-gateway, orders-service]' \
  --data ci_provider=gitlab --data deploy_target=ninguno \
  <origen-de-la-plantilla> ./docs
cd docs
git init -b main && make instalar && make validar && make construir
git add . && git commit -m "docs: scaffold inicial"
```

## Preguntas (`copier.yml`)

| Pregunta | Default | Uso |
|---|---|---|
| `org_name` | `mi-org` | Grupo/owner; base de `url_repo` de las fichas y de `repo_url` del sitio |
| `titulo_sitio` | `Documentación de <org>` | `site_name`, `index.md`, `CLAUDE.md` |
| `repos_iniciales` | `[protos, api-gateway]` | Lista YAML (kebab-case, sin repetidos). Una ficha por repo, repos del issue 001 y mapa inicial |
| `obsidian` | `true` | `contenido/.obsidian/` mínimo |
| `deploy_target` | `ninguno` | `firebase-hosting` \| `coolify` \| `ninguno` |
| `firebase_project` | `<org>-docs` | Sólo firebase-hosting |
| `ci_provider` | `gitlab` | `gitlab` \| `github` |
| `fecha_inicio` | hoy | Fecha del ADR 0001 y del issue 001. Se guarda en las respuestas: `copier update` no cambia las fechas |

Derivados (no se guardan): `deploy_fb`, `deploy_cy`, `ci_gl`, `ci_gh` (flags
cortos para nombres condicionales: rutas de Windows), `url_org` y `tipos_repo`
(tipo de ficha deducido del nombre: `protos`, `*gateway*`, `*-service`,
`*-web`/`*-app`, `otro`).

## Versiones fijadas

| Pieza | Versión |
|---|---|
| mkdocs / mkdocs-material / pymdown-extensions | 1.6.1 / 9.7.7 / 12.1 |
| PyYAML / jsonschema | 6.0.3 / 4.26.0 |
| markdownlint-cli2 (npx o imagen `davidanson/markdownlint-cli2`) | 0.23.3 |
| lychee (imagen GitLab `lycheeverse/lychee:0.24.2-alpine`; GitHub `lycheeverse/lychee-action@v2`) | 0.24.2 |
| Imágenes de deploy | `python:3.12-slim` (build), `caddy:2-alpine` (runtime), `node:24`, `docker:27` |

## Decisiones

- **Un archivo por unidad, agregados generados.** `generar.py` es determinista
  (orden estable, sin fecha de generación) para que `make generar` +
  `git diff --exit-code` sirva de chequeo en el CI. «Resueltos recientes» son
  los últimos 20 por fecha de resolución, no «de los últimos N días» (eso
  cambiaría solo con el paso del tiempo).
- **`_generado/` viene renderizado en la plantilla** (Jinja que replica la
  salida de `generar.py`), así el repo nace consistente sin `_tasks` (que
  exigirían `--trust`). `_skip_if_exists` evita que `copier update` lo pise:
  después de un update se corre `make generar`. El CI de dev-plantillas
  detecta si la réplica Jinja y el script divergen (generar sin diff).
- **Numeración contra el remoto.** `nuevo.py` toma el máximo entre las
  carpetas locales y `git ls-tree` de la rama principal del remoto (después de
  un `git fetch` silencioso; si falla o no hay remoto, sólo local). Si igual
  chocan, `validar.py` falla por id duplicado.
- **Validación** con mensajes `archivo: campo: problema` en español; además de
  los esquemas: nombre de carpeta/archivo coherente con el frontmatter, ids
  duplicados, repos con ficha (`area`, `repos`, `depende_de`, `consumido_por`,
  `servicios`), issues/ADRs referenciados que existan, `area` dentro de
  `repos`, y `resuelto` sólo con la sección Verificación completa. Esquemas
  con `additionalProperties: false`: un campo mal escrito falla.
- **Issue recién creado válido:** `area`/`repos` pueden quedar vacíos mientras
  el estado es `abierto` (aviso, no error); para `en-curso` o `resuelto` son
  obligatorios. Sin `AREA`, el área es el repo de `REPOS` sólo si hay uno
  (el repo principal no siempre es el primero del orden).
- **Navegación**: menú fijo por secciones; issues, ADRs y fichas se llegan por
  los índices generados y la búsqueda (con cientos de issues, el menú
  automático sería ilegible). El hook agrega la lista de documentos al índice
  de runbooks, postmortems, releases, servicios y casos de uso, así nada queda
  huérfano sin un índice editado a mano.
- **mkdocs fijo en 1.6.1**: MkDocs 2.0 rompe Material y sus plugins; el aviso
  de Material al respecto se silencia en el Makefile (`NO_MKDOCS_2_WARNING`).
- **Deploy**: un solo ambiente (push a `main`), porque la documentación no
  tiene QA/prod. Firebase igual que `angular-app` (WIF sin claves); Coolify con
  imagen Caddy que construye el sitio con `--strict` dentro del Dockerfile y
  tags `prod` + SHA. Basic auth opcional en la imagen (`DOCS_USUARIO` +
  `DOCS_HASH`), con `/salud` libre para el healthcheck.
- **lychee sólo en la rama principal**; excluye `localhost`, `example.*` y los
  repos de la propia org (suelen ser privados).
- El job que en `main` regenera y commitea solo (spec §5) **no** se incluye:
  necesita un token con permiso de push. El CI falla y se corre `make generar`.

## Verificar cambios en la plantilla

Generar con varias combinaciones (ambos `ci_provider`, los tres
`deploy_target`, `obsidian` sí/no, `repos_iniciales` vacío) y en cada una:

```bash
git init -b main && git add -A && git commit -m base
make validar && make generar && git diff --exit-code && make construir
make nuevo TIPO=issue TITULO="x" && make nuevo TIPO=issue TITULO="y"   # 002 y 003
```

Errores esperados: `estado: cerrado`, un repo sin ficha en `repos` o una
carpeta de issue duplicada → `make validar` falla con archivo y campo; editar
`_generado/` a mano → `make generar` + `git diff --exit-code` falla; un enlace
roto → `make construir` falla. Coolify: `docker build`, `docker run -p 8080:80`
y `curl` a `/` y a una página interna. CI: `actionlint` (GitHub) y parseo de
`.gitlab-ci.yml`. `copier update` necesita la plantilla en un repo git con
tags PEP 440 (`v0.0.1`, no `v0.0.0-ci`): `scripts/publish-template.sh docs vX.Y.Z <remote>`.

Lo automatiza el job `docs` de `.github/workflows/templates.yml`.

## Limitaciones conocidas

- `make` en Windows corre desde Git Bash; en PowerShell se usan los comandos
  `python scripts/...` (tabla del README generado).
- Firebase Hosting es público: para documentación interna conviene `coolify`
  con basic auth, o `ninguno`.
- `copier update` no regenera `_generado/` (a propósito): hay que correr
  `make generar` y commitear.
- Borrar el issue 001 o el ADR 0001 de ejemplo es una decisión del usuario; si
  se borran, `copier update` respeta el borrado.
- Sin sincronización con GitHub/GitLab Issues ni migración de repos de
  documentación existentes (fuera de alcance, spec §11).
