# Cómo documentar

Reglas de este repo. Valen igual para personas y agentes.

## Qué va acá y qué junto al código

**Si cambia junto con el código, vive en el repo del código.** Si cruza repos,
vive acá.

| Junto al código (cada repo) | Este repo |
|---|---|
| `README.md`, `CLAUDE.md`, `docs/` de uso y deploy, `CHANGELOG.md` | Issues, ADRs, arquitectura, fichas de servicios, runbooks, postmortems, casos de uso, releases |

La ficha de un servicio es corta y **enlaza** al README del repo; no lo duplica.

## Reglas

1. **Un archivo por unidad.** Cada issue, ADR, runbook o release es su propio
   archivo. Nadie edita archivos compartidos.
2. **Los índices se generan.** `contenido/_generado/` lo escribe
   `make generar` a partir del frontmatter. Editarlo a mano rompe el CI.
3. **El nombre del archivo es el nombre del repo.** Sin alias: si el repo es
   `api-gateway`, la ficha es `servicios/api-gateway.md` y en `repos:` se
   escribe `api-gateway`.
4. **Se crea con `make nuevo`**, nunca copiando archivos: toma el número
   siguiente (mirando también el remoto) y deja el frontmatter válido.
5. **Fechas absolutas** (`2026-10-09`), nunca «ayer» ni «la semana pasada».
6. **Enlaces Markdown estándar y relativos** (`[texto](../adr/0001-x.md)`), no
   `[[wikilinks]]`: funcionan en el sitio, en GitHub/GitLab y en Obsidian.
7. **Nada de secretos** ni datos personales: van en Secret Manager o en las
   variables del CI.
8. Nombres de carpeta y archivo en minúsculas y `kebab-case`. Issues con 3
   dígitos (`042-descuentos`), ADRs con 4 (`0007-rate-limit`).

## Comandos

| Comando | Qué hace |
|---|---|
| `make nuevo TIPO=issue TITULO="..." [REPOS=a,b] [PRIORIDAD=alta] [CLASE=bug]` | Crea `issues/<nnn>-<slug>/issue.md` |
| `make nuevo TIPO=plan ISSUE=42` | Crea `plan.md` en la carpeta del issue y lo enlaza |
| `make nuevo TIPO=adr TITULO="..."` | Crea `adr/<nnnn>-<slug>.md` |
| `make nuevo TIPO=runbook TITULO="..." REPOS=a` | Crea `runbooks/<slug>.md` |
| `make nuevo TIPO=postmortem TITULO="..." REPOS=a` | Crea `postmortems/<fecha>-<slug>.md` |
| `make nuevo TIPO=release VERSION=1.4.0 [REPOS=a,b]` | Crea `releases/v1.4.0.md` |
| `make nuevo TIPO=servicio TITULO=<repo>` | Crea `servicios/<repo>.md` |
| `make validar` | Frontmatter (esquemas, ids, fichas) + markdownlint |
| `make generar` | Regenera `_generado/` |
| `make servir` | Sitio en <http://localhost:8000> |
| `make construir` | `mkdocs build --strict` (un enlace roto falla) |

## Issues

Carpeta `issues/<nnn>-<slug>/` con `issue.md` (qué y por qué) y, si hace falta,
`plan.md` (el cómo, o el prompt para el agente). Evidencia adicional (capturas,
logs) puede ir en la misma carpeta.

| Campo | Valores |
|---|---|
| `estado` | `abierto` · `en-curso` · `bloqueado` · `resuelto` · `descartado` |
| `tipo` | `feature` · `bug` · `deuda` · `investigacion` |
| `prioridad` | `alta` · `media` · `baja` |
| `area` | Repo principal (nombre exacto, con ficha) |
| `repos` | Repos que toca, **en orden de ejecución** (ej. protos → servicio → api-gateway → front) |
| `resuelto` | `null` hasta que se resuelve; después la fecha |
| `relacionados` | Números de otros issues |

Para pasar a `en-curso`, `area` y `repos` tienen que estar completos. Para pasar
a `resuelto`, la sección **Verificación** tiene que tener fecha, comandos y
commits (la escribe `/verificar`).

## ADRs

Un ADR `aceptado` no se edita. Si la decisión cambia, se escribe uno nuevo con
`reemplaza: <n>` y al viejo se le pone `estado: reemplazado` y
`reemplazado_por: <nuevo>` (único cambio permitido).

## Releases y rollout

Cada release es `releases/vX.Y.Z.md`, con `servicios:` = repo → versión en QA y
en prod. El [rollout](../_generado/rollout.md) se genera de ahí: no hay un
archivo de estado compartido que actualizar.

## Validación (CI)

| Paso | Falla si |
|---|---|
| `make validar` | Falta un campo, valor fuera de la lista, id duplicado, repo sin ficha, `resuelto` sin Verificación, estilo Markdown |
| `make generar` + `git diff --exit-code` | `_generado/` desactualizado o editado a mano |
| `make construir` | Enlace interno roto |
| lychee (sólo rama principal) | Enlace externo roto |
