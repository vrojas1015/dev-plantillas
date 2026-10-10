# CLI `dp`

Especificación de la herramienta de línea de comandos que une todo
`dev-plantillas`: catálogo de plantillas, creación y actualización de
proyectos, workspace del equipo e issues. Reemplaza los scripts sueltos
(`bootstrap.ps1`, `new-worktree.ps1`, `publish-template.sh`) y los comandos
largos de Copier, `gh` y `git` que hoy se escriben a mano.

Se construye **en modo pair**: el núcleo lo escribe el autor del repo, con guía
y revisión (ver §9).

## 1. Qué problema resuelve

| Hoy | Con `dp` |
|---|---|
| `copier copy --vcs-ref v0.2.1 --defaults --trust -d service_name=x -d deploy_target=coolify gh:dev-plantillas/template-go-grpc-service x` | `dp new go-grpc-service x --deploy coolify` |
| Recordar qué plantillas existen y su última versión | `dp list` |
| `git init`, `git add --chmod=+x scripts/*.sh`, primer commit, `gh repo create` | Lo hace `dp new` |
| Saber qué repos están atrasados respecto de su plantilla | `dp status` |
| `copier update` repo por repo | `dp update --all` |
| `bootstrap.ps1` y `new-worktree.ps1` (sólo Windows) | `dp workspace init` y `dp issue start 42` (cualquier sistema) |
| Leer el issue para saber qué repos crear | `dp issue start` lee el frontmatter del issue |
| `publish-template.sh` | `dp plantilla publicar` |

## 2. Decisiones técnicas

| Tema | Decisión | Por qué |
|---|---|---|
| Lenguaje | **Python 3.12+** | Copier es una librería Python: se usa por API, sin subprocesos ni parseo de salidas |
| Framework de CLI | **Typer** + **Rich** | Tipos, ayuda automática, tablas legibles |
| Ubicación | `cli/` dentro de `dev-plantillas` | Versionado junto a las plantillas y los docs |
| Instalación | `uv tool install "git+https://github.com/dev-plantillas/dev-plantillas@cli-v0.1.0#subdirectory=cli"` (o `pipx`) | Un comando en Windows, macOS y Linux; aislado del Python del sistema |
| Versionado | Tags `cli-vX.Y.Z` (independientes de los de las plantillas) | La CLI y las plantillas evolucionan a ritmos distintos |
| Dependencias externas | `git` obligatorio; `gh`/`glab`, `docker`, toolchains según la plantilla | `dp doctor` dice qué falta para cada caso |

## 3. Catálogo

`catalogo.yaml` en la raíz de `dev-plantillas` (rama `main`). `dp` lo lee del
remoto con caché local de 24 h; `--offline` usa la caché.

```yaml
version: 1
plantillas:
  - nombre: go-grpc-service
    repo: gh:dev-plantillas/template-go-grpc-service
    tipo: backend            # backend | gateway | contratos | front | movil | docs
    lenguaje: go
    descripcion: Microservicio Go gRPC hexagonal + Postgres
    destino_por_defecto: backend/{nombre}-service
    atajos:                  # flags de dp new → preguntas de Copier
      deploy: deploy_target
      ci: ci_provider
  - nombre: angular-app
    repo: gh:dev-plantillas/template-angular-app
    tipo: front
    ...
```

- La **última versión** de cada plantilla sale de los tags del repo
  (`git ls-remote --tags`), no del catálogo: el catálogo no se desactualiza.
- **Catálogos adicionales** (p. ej. el de una empresa, con plantillas privadas):
  `dp catalogo agregar <url>`. Si dos catálogos tienen el mismo nombre de
  plantilla, se usa `<catalogo>/<plantilla>`.

## 4. Workspace

`dp workspace init` crea en la raíz (`C:\dev\<org>` o `~/dev/<org>`) el
archivo `.dp/workspace.toml`, que reemplaza a `repos.txt`:

```toml
org = "mi-org"
proveedor = "gitlab"              # gitlab | github
url_base = "https://gitlab.com/mi-org"
docs = "docs"                     # carpeta del repo de documentación (opcional)

[[repo]]
ruta = "backend/protos"
url = "https://gitlab.com/mi-org/backend/protos.git"

[[repo]]
ruta = "backend/orders-service"
url = "https://gitlab.com/mi-org/backend/orders-service.git"
```

`dp` busca `.dp/workspace.toml` subiendo desde el directorio actual (igual que
git busca `.git`). Fuera de un workspace, los comandos que lo necesitan lo
dicen y sugieren `dp workspace init`.

## 5. Comandos

### Plantillas y proyectos

| Comando | Qué hace |
|---|---|
| `dp list [--tipo backend] [--json]` | Tabla: nombre, tipo, lenguaje, última versión, descripción |
| `dp info <plantilla>` | Preguntas de la plantilla, atajos y ejemplo de uso |
| `dp new <plantilla> [destino] [--version vX] [--deploy …] [--ci …] [-d clave=valor …] [--defaults]` | `copier copy` desde la última versión (o la indicada) → `git init` → bits de ejecución en los `.sh` → primer commit → si hay workspace, lo registra en `workspace.toml` y crea la ficha en `docs` (`make nuevo TIPO=servicio`) |
| `dp new … --remoto [privado\|publico]` | Además crea el repo remoto con `gh`/`glab` y hace el primer push. **Privado por defecto**; público sólo explícito, con confirmación |
| `dp status [--json]` | Por cada repo del workspace: plantilla, versión actual (`.copier-answers.yml`), última disponible, rama, cambios sin commitear |
| `dp update [ruta] [--to vX] [--all]` | En una rama nueva `chore/plantilla-vX`: `copier update`; reporta archivos con conflicto y `.rej`; nunca pushea. `--all` recorre los repos atrasados y muestra un resumen |
| `dp doctor [plantilla]` | Verifica herramientas y versiones (git, copier, go, node, python, buf, docker, gh/glab, claude), sesión de `gh`/`glab`, que el workspace no esté en una carpeta sincronizada (OneDrive, Dropbox, iCloud). Con una plantilla, sólo lo que ésta necesita |

### Workspace e issues

| Comando | Qué hace |
|---|---|
| `dp workspace init --org <org> --proveedor gitlab` | Crea carpetas (`backend`, `frontend`, `tools`, `worktrees`), los `CLAUDE.md` en capas y `.dp/workspace.toml`. Nunca pisa archivos existentes |
| `dp workspace clonar` | Clona los repos de `workspace.toml` que falten |
| `dp issue list [--estado abierto] [--repo x]` | Lee el frontmatter de `docs/contenido/issues/*/issue.md` |
| `dp issue new "<título>" [--repos a,b]` | Equivale a `make nuevo TIPO=issue` en `docs` |
| `dp issue start <n>` | Lee `repos` del issue y crea un worktree por repo en `worktrees/issue-<n>/` con la rama `feat/issue-<n>-<slug>`; pasa el estado a `en-curso`. Imprime dónde abrir la sesión |
| `dp issue close <n>` | Verifica que no queden cambios sin commitear ni ramas sin pushear; quita los worktrees. No cambia el estado del issue (eso lo hace `/cerrar-issue` con la evidencia) |

### Mantenimiento de plantillas (para quien las mantiene)

| Comando | Qué hace |
|---|---|
| `dp plantilla probar <nombre> [--matriz]` | Genera la plantilla con las combinaciones definidas en `templates/<nombre>/matriz.yaml` y corre sus verificaciones. El CI de `dev-plantillas` pasa a usar este comando en vez de repetir pasos en el workflow |
| `dp plantilla publicar <nombre> <vX.Y.Z>` | Lo que hace hoy `publish-template.sh`, con chequeos previos: rama `main` al día, árbol limpio, versión mayor que la última publicada |

### Convenciones de todos los comandos

- `--json` en todo lo que lista o informa: salida estable para scripts y para
  las skills del plugin.
- `--yes` para no preguntar (CI, agentes). Sin `--yes`, toda acción remota o
  destructiva pide confirmación mostrando el comando equivalente.
- Exit codes: `0` ok, `1` error del usuario (argumento, estado del repo), `2`
  falta una herramienta o permiso, `3` conflicto (p. ej. `update` con `.rej`).
- Mensajes en español; cada error dice qué pasó y qué hacer.
- `dp --version`, `dp <comando> --help`.

## 6. Integración con el plugin `dev-agentes`

Las skills dejan de reimplementar lógica y llaman a `dp … --json`:

| Skill | Usa |
|---|---|
| `/nuevo-proyecto` | `dp list --json` para ofrecer opciones → `dp new … --yes` |
| `/issue-start <n>` | `dp issue start <n> --json` |
| `/cerrar-issue` | `dp issue close <n>` después de escribir la evidencia |
| `/verificar` | Sin cambios (usa `verify.sh`) |

`dp doctor` también revisa que el plugin esté instalado en Claude Code.

## 7. Estructura del código

```
cli/
├── pyproject.toml              ← entry point `dp`, dependencias fijadas
├── src/dp/
│   ├── main.py                 ← app Typer; registra los grupos de comandos
│   ├── comandos/               ← un módulo por grupo: plantillas, workspace, issue, mantenimiento
│   ├── catalogo.py             ← lectura, caché, versiones por tags
│   ├── workspace.py            ← buscar y leer/escribir .dp/workspace.toml
│   ├── issues.py               ← frontmatter de docs
│   ├── git.py                  ← envoltorio mínimo de git (subprocess, sin shell)
│   ├── remoto.py               ← gh / glab
│   └── salida.py               ← tablas Rich y modo --json
└── tests/
    ├── conftest.py             ← workspace temporal, plantillas locales, gh/glab falsos en el PATH
    └── test_*.py
```

Reglas:

- **Lógica separada de la presentación:** cada comando llama a funciones que
  devuelven datos; `salida.py` decide tabla o JSON. Se testea la lógica sin
  parsear texto.
- `subprocess` siempre con lista de argumentos (sin `shell=True`).
- Rutas con `pathlib`; nada de suponer `/` o `\`.

## 8. Calidad

- **Tests:** pytest con directorios temporales; las plantillas de prueba se
  toman de `templates/` local (con un repo git y un tag para probar `update`).
  `gh`/`glab` se reemplazan por scripts falsos en el `PATH` que registran con
  qué argumentos los llamaron.
- **CI:** matriz **Windows + Ubuntu** (+ macOS en la rama principal); ruff,
  mypy y pytest; un test end-to-end: `dp workspace init` → `dp new` de cada
  plantilla → `dp status` → `dp update` → `dp issue start`.
- Cobertura mínima de la lógica (no de la presentación): 80 %.

## 9. Hitos y quién hace qué (modo pair)

| # | Hito | Quién | Qué se aprende |
|---|---|---|---|
| H1 | Esqueleto: `pyproject`, Typer, `dp --version`, `dp list` desde `catalogo.yaml` local, tests, CI | **Autor** (con guía) | Estructura de un paquete Python moderno, CLI con tipos, tests |
| H2 | `dp new` con la API de Copier, git init y primer commit | **Autor** | Usar una librería por API, efectos en el sistema de archivos, tests con temporales |
| H3 | `dp doctor` | Claude | — |
| H4 | Catálogo remoto con caché + versiones por tags + `dp info` | **Autor** | Red, caché, degradar bien sin conexión |
| H5 | `dp workspace init/clonar` + `dp status` | Pair | Diseño de un archivo de configuración |
| H6 | `dp issue list/new/start/close` | Claude | — |
| H7 | `dp update [--all]` | Pair | Flujos con conflictos y reportes claros |
| H8 | `dp new --remoto` | Claude | — |
| H9 | `dp plantilla probar/publicar` + migrar el CI | Claude | — |
| H10 | Skills del plugin sobre `dp --json`; borrar los scripts viejos | Claude | — |

Cada hito es un issue y un PR, con su revisión. Al final de H2, `dp` ya sirve
para el uso diario (`list` + `new`).

## 10. Criterios de terminado (v1)

- [ ] `uv tool install` desde el tag funciona en Windows y Linux; `dp --version`.
- [ ] `dp list` muestra las plantillas del catálogo con su última versión real
      (tags); `--json` es válido y estable.
- [ ] `dp new go-grpc-service orders --deploy coolify --defaults` genera un
      proyecto que compila, con primer commit y scripts ejecutables.
- [ ] `dp new … --remoto` sin `--yes` muestra el comando y pide confirmación;
      por defecto crea el repo **privado**.
- [ ] En un workspace con un repo en `v0.2.0` de su plantilla y `v0.2.1`
      publicada, `dp status` lo marca atrasado y `dp update` lo actualiza en
      una rama nueva sin pushear.
- [ ] `dp issue start 42` con un issue de `repos: [protos, orders-service]`
      crea los dos worktrees y pasa el issue a `en-curso`; el hook
      `guard-worktree` permite editar dentro y bloquea fuera.
- [ ] `dp doctor` dentro de OneDrive avisa del problema; sin `gh` instalado lo
      reporta con exit 2 y cómo instalarlo.
- [ ] `dp plantilla probar` reemplaza los pasos repetidos del CI de
      `dev-plantillas`.
- [ ] Tests en verde en Windows y Ubuntu; cobertura de la lógica ≥ 80 %.
- [ ] `bootstrap.ps1`, `new-worktree.ps1` y `publish-template.sh` eliminados;
      la documentación (`README`, `docs/01–03`) usa `dp`.
