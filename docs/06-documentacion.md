# Repo de documentación: diseño

Especificación de la plantilla `docs` (implementada en `templates/docs/`). Genera el repo
central de documentación de una plataforma: issues, decisiones, arquitectura,
runbooks y releases. Lo leen personas (MkDocs, Obsidian, GitHub/GitLab) y
agentes (rutas predecibles, metadatos validados).

Decisiones tomadas: **issues en archivos Markdown**, sitio con **MkDocs
Material**, todo en **español**.

## 1. Problemas que resuelve

Diagnóstico de un repo de documentación real con ~200 issues y varias sesiones
de agentes escribiendo en paralelo:

| Problema | Regla de la plantilla |
|---|---|
| Metadatos en texto libre (`> **Estado:** open`): no se pueden filtrar ni validar | **Frontmatter YAML** validado por esquema en el CI |
| Archivos agregados (estado de rollout, índices) editados por varias sesiones a la vez: commits mezclados y un ritual de índice temporal para evitarlo | **Un archivo por unidad**; los agregados se **generan** con un script, nadie los edita |
| Carpetas con nombres distintos a los repos (`round-protos` vs `roel-protos`) | **El nombre del archivo es el nombre del repo**, sin alias |
| Prompts para agentes sueltos (`Prompt-*.md`), desconectados de su issue | El plan del agente vive **dentro de la carpeta del issue** |
| Un clon viejo con los mismos números de issue y contenido distinto | **Una sola fuente**: este repo. Las versiones viejas se consultan con tags de git |

## 2. Qué va acá y qué junto al código

**Regla:** si cambia junto con el código, vive en el repo del código. Si
cruza repos, vive en `docs`.

| Junto al código (cada repo) | Repo central `docs` |
|---|---|
| `README.md`, `CLAUDE.md`, `docs/` de uso y deploy, `CHANGELOG.md` | Issues, ADRs, arquitectura de la plataforma, fichas de servicios, runbooks, casos de uso, releases |

La ficha de cada servicio en `docs` es corta (qué hace, quién lo consume, de qué
depende, enlaces) y **enlaza** al README del repo; no lo duplica.

## 3. Estructura

```
docs/
├── mkdocs.yml
├── CLAUDE.md                     ← reglas para agentes
├── README.md
├── esquemas/                     ← JSON Schema del frontmatter de cada tipo
├── scripts/                      ← nuevo.py, generar.py, validar.py
├── contenido/                    ← lo que publica MkDocs (docs_dir)
│   ├── index.md
│   ├── plataforma/               ← mapa de servicios, arquitectura (Mermaid), ambientes, glosario
│   ├── servicios/<repo>.md       ← una ficha por repo
│   ├── issues/<n>-<slug>/
│   │   ├── issue.md              ← qué, por qué, criterios, repos, evidencia
│   │   └── plan.md               ← (opcional) plan o prompt para el agente
│   ├── adr/NNNN-<titulo>.md      ← decisiones de arquitectura
│   ├── runbooks/                 ← deploy, rollback, migraciones, incidentes
│   ├── postmortems/AAAA-MM-DD-<slug>.md
│   ├── casos-de-uso/
│   ├── releases/vX.Y.Z.md        ← una nota por release
│   └── _generado/                ← índices: NADIE los edita a mano
├── _plantillas/                  ← issue, plan, adr, runbook, postmortem, release, servicio
└── .github/ | .gitlab-ci.yml
```

Los nombres de carpeta y archivo van en minúsculas y `kebab-case`. Los números
de issue se rellenan a 3 dígitos (`042-descuentos`), los de ADR a 4.

## 4. Tipos de documento y su frontmatter

Cada tipo tiene su esquema en `esquemas/` y su plantilla en `_plantillas/`.

### Issue (`issues/<n>-<slug>/issue.md`)

```yaml
---
id: 42
titulo: Descuento por pedido con tope
estado: abierto            # abierto | en-curso | bloqueado | resuelto | descartado
tipo: feature              # feature | bug | deuda | investigacion
prioridad: media           # alta | media | baja
area: orders-service       # repo principal (nombre exacto del repo)
repos: [protos, orders-service, api-gateway, admin-web]   # en orden de ejecución
creado: 2026-10-09
resuelto: null
relacionados: [37]
---
```

Secciones del cuerpo: **Contexto** (qué pasa hoy y por qué importa) ·
**Comportamiento esperado** · **Criterios de aceptación** (lista verificable) ·
**Repos y orden** · **Notas** · **Verificación** (la escribe `/verificar`,
con fecha, comandos y commits).

`plan.md` es opcional: el plan detallado o el prompt para el agente. Si existe,
`issue.md` lo enlaza. Reemplaza a los `Prompt-*.md` sueltos.

### ADR (`adr/NNNN-<titulo>.md`)

```yaml
---
id: 7
titulo: Rate limit en Redis cuando haya más de una instancia
estado: aceptado           # propuesto | aceptado | reemplazado | descartado
fecha: 2026-10-09
reemplaza: null
reemplazado_por: null
---
```

Cuerpo: **Contexto** · **Opciones** (con pros y contras) · **Decisión** ·
**Consecuencias**. Un ADR aceptado no se edita: si cambia la decisión se escribe
otro que lo reemplaza.

### Ficha de servicio (`servicios/<repo>.md`)

```yaml
---
repo: orders-service
tipo: servicio-go          # servicio-go | gateway | protos | front | movil | libreria | otro
plantilla: go-grpc-service@v0.2.1   # de qué plantilla y versión salió (si aplica)
dueño: backend
url_repo: https://gitlab.com/<org>/backend/orders-service
depende_de: [protos]
consumido_por: [api-gateway]
estado: activo             # activo | deprecado | retirado
---
```

Cuerpo: qué hace (2–3 líneas), enlaces a README/CLAUDE.md/docs del repo,
ambientes y URLs, contactos.

### Runbook, postmortem y release

| Tipo | Frontmatter mínimo | Cuerpo |
|---|---|---|
| Runbook | `titulo`, `servicios`, `actualizado` | Cuándo usarlo · Pasos numerados con comandos · Cómo verificar · Cómo deshacer |
| Postmortem | `fecha`, `severidad`, `servicios`, `issues` | Resumen · Impacto · Línea de tiempo · Causa raíz · Qué funcionó · Acciones (con issue cada una). Sin culpables |
| Release | `version`, `fecha`, `servicios` (repo → versión desplegada en QA y prod), `issues` | Qué entra · Migraciones · Pasos manuales · Rollback |

`releases/vX.Y.Z.md` reemplaza a los archivos de estado de rollout compartidos:
cada release es un archivo propio y el tablero de rollout se **genera**.

## 5. Archivos generados

`scripts/generar.py` lee el frontmatter de todos los documentos y escribe en
`contenido/_generado/`:

| Archivo | Contenido |
|---|---|
| `issues-por-estado.md` | Tablas de issues abiertos, en curso, bloqueados y resueltos recientes |
| `issues-por-repo.md` | Para cada repo, sus issues abiertos (sirve para planificar) |
| `adr.md` | Índice de decisiones con su estado |
| `servicios.md` | Mapa de servicios + diagrama Mermaid de dependencias (desde `depende_de`) |
| `rollout.md` | Qué versión de cada servicio está en QA y en prod, según las releases |

Reglas:

- Los generados llevan un encabezado «Archivo generado: no editar».
- El CI regenera y **falla si hay diferencias** (alguien editó a mano o se olvidó
  de regenerar). En la rama principal, un job puede regenerar y commitear solo.
- Así ninguna sesión necesita tocar un archivo compartido.

## 6. Scripts y comandos

```bash
make nuevo TIPO=issue TITULO="Descuento por pedido con tope"   # crea la carpeta con el número siguiente
make nuevo TIPO=adr TITULO="Rate limit en Redis"
make generar        # regenera _generado/
make validar        # esquemas de frontmatter + enlaces + markdownlint
make servir         # mkdocs serve en http://localhost:8000
make construir      # mkdocs build --strict
```

- `nuevo.py` toma el número siguiente mirando lo que existe **en el remoto**
  (`git fetch` + rama principal) para que dos personas no tomen el mismo
  número. Si igual choca, el CI lo detecta (ids duplicados).
- Python sin dependencias raras: `pyyaml`, `jsonschema`, `mkdocs-material`.

## 7. Sitio (MkDocs Material)

- `docs_dir: contenido`, navegación por secciones, búsqueda, modo oscuro.
- Mermaid con `pymdownx.superfences`.
- **Enlaces Markdown estándar** (no `[[wikilinks]]`): se ven bien en MkDocs,
  GitHub, GitLab y Obsidian.
- Metadatos visibles: un hook de MkDocs muestra el estado, la prioridad y los
  repos del frontmatter al principio de cada issue.
- `mkdocs build --strict`: un enlace roto rompe el build.
- **Obsidian** sigue funcionando: se abre `contenido/` como vault. La plantilla
  trae un `.obsidian/` mínimo opcional (pregunta `obsidian`).
- Deploy con el mismo `deploy_target` que el resto de las plantillas:
  `firebase-hosting` | `coolify` | `ninguno`. Si la documentación es interna, el
  sitio va detrás de autenticación (Firebase Hosting + Identity-Aware Proxy, o
  basic auth en Coolify) o directamente `ninguno` y se lee desde el repo.

## 8. Agentes

`CLAUDE.md` del repo (≤ 120 líneas):

- **Sólo** se edita el archivo del propio issue (`issues/<n>-*/`). Nunca otros
  issues ni `_generado/`.
- Fechas absolutas (`2026-10-09`), nunca «ayer».
- Un issue pasa a `resuelto` sólo con la sección **Verificación** completa.
- Para crear documentos se usa `make nuevo`, no se copian archivos a mano.

Integración con el plugin `dev-agentes`:

| Skill | Qué hace con `docs` |
|---|---|
| `/issue-nuevo` | `make nuevo TIPO=issue`, completa el frontmatter y las secciones con el usuario |
| `/issue-start <n>` | Lee `issue.md` (+ `plan.md`), crea los worktrees de `repos` en orden |
| `/verificar` | Escribe la sección Verificación en `issue.md` |
| `/cerrar-issue` | Pasa el estado a `resuelto`, pone `resuelto: <fecha>`, abre los MR/PR |
| `/adr-nuevo`, `/postmortem` | Crean el documento desde su plantilla |

> **Ajuste necesario en el plugin:** el hook `guard-worktree` hoy permite
> `docs/issues/<n>-*.md` (un archivo). Con la carpeta por issue tiene que
> permitir `docs/contenido/issues/<n>-*/**`. Se cambia junto con la plantilla.

## 9. CI

| Paso | Herramienta | Falla si |
|---|---|---|
| Frontmatter | `scripts/validar.py` + `esquemas/*.json` | Falta un campo, valor fuera de la lista, id duplicado, `repos` con un nombre que no tiene ficha en `servicios/` |
| Markdown | markdownlint | Estilo inconsistente (configuración permisiva, sin largo de línea) |
| Enlaces | `mkdocs build --strict` + lychee para externos (sólo en la rama principal, para no depender de la red en cada PR) | Enlace roto |
| Generados | `make generar` + `git diff --exit-code` | `_generado/` desactualizado |
| Deploy | Igual que `angular-app` (Firebase Hosting con WIF, o imagen + webhook de Coolify) | — |

## 10. Plantilla: preguntas

```
org_name:        mi-org
titulo_sitio:    "Documentación de <org>"
repos_iniciales: [protos, api-gateway]     # crea una ficha por repo
obsidian:        true | false
deploy_target:   firebase-hosting | coolify | ninguno
ci_provider:     gitlab | github
```

Contenido inicial generado: `index.md`, `plataforma/` con un mapa de servicios
vacío y la guía de cómo documentar, una ficha por repo inicial, el **ADR 0001
«Registrar decisiones de arquitectura»**, un issue de ejemplo (`001`) y todas
las plantillas.

## 11. Fuera de alcance (por ahora)

- **Sincronizar con GitHub/GitLab Issues.** Los archivos son la fuente; se
  puede agregar después un job que refleje el estado en el tracker.
- **Migrar un repo de documentación existente.** Un script que convierta issues
  con metadatos en texto (`> **Estado:** ...`) a frontmatter y carpetas es
  viable, pero es un trabajo aparte y opcional.
- Versionado del sitio por release (`mike`).

## 12. Criterios de terminado

- [ ] `copier copy` genera un repo donde `make validar`, `make generar` (sin
      diff) y `make construir` pasan.
- [ ] `make nuevo TIPO=issue` crea `issues/002-<slug>/issue.md` con frontmatter
      válido; dos `make nuevo` seguidos no repiten número.
- [ ] Un issue con `estado: cerrado` (valor inválido) o un `repos` sin ficha
      → `make validar` falla con un mensaje que dice archivo y campo.
- [ ] Editar a mano `_generado/` → el CI falla.
- [ ] Un enlace roto → `mkdocs build --strict` falla.
- [ ] El sitio muestra estado/prioridad/repos al principio de cada issue y el
      diagrama de servicios se renderiza.
- [ ] Imagen de Coolify y deploy de Firebase Hosting como en `angular-app`.
- [ ] `guard-worktree` actualizado: una sesión en `worktrees/issue-42/` puede
      editar `docs/contenido/issues/042-*/` y no la del 43 (tests del hook).
- [ ] `copier update` entre dos versiones sin conflictos.
