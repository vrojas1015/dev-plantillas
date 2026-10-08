# Estructura de carpetas del equipo

Todos los integrantes clonan los repos con **la misma estructura y los mismos
nombres**. Así los `CLAUDE.md`, los scripts (`make workspace`, `../protos`) y
las rutas que se pasan entre sesiones funcionan en cualquier máquina.

## Dónde vive

| Sistema | Raíz |
|---|---|
| Windows | `C:\dev\<org>\` |
| macOS / Linux | `~/dev/<org>/` |

**Nunca dentro de OneDrive, Dropbox ni iCloud.** La sincronización bloquea archivos
mientras git o los agentes escriben, corrompe `.git` y sube `node_modules` y
`vendor/`. El respaldo del código es el remoto (GitLab/GitHub), no la nube del
sistema operativo.

## Layout

```
C:\dev\<org>\
├── CLAUDE.md                 ← reglas de toda la plataforma (no es un repo; ver abajo)
├── backend\
│   ├── CLAUDE.md             ← convenciones comunes del backend
│   ├── protos\               ← contratos (repo <org>/protos)
│   ├── api-gateway\
│   ├── <dominio>-service\    ← un repo por micro
│   └── ...
├── frontend\
│   ├── CLAUDE.md             ← convenciones comunes del front
│   └── <app>\                ← un repo por app (admin, landing, ...)
├── docs\                     ← repo de documentación: issues, ADRs, runbooks
├── tools\                    ← scripts y migraciones de datos (repo propio)
├── plantillas\               ← este repo (dev-plantillas)
└── worktrees\                ← worktrees de agentes, uno por issue (ver abajo)
    └── issue-42\
        ├── orders-service\
        └── api-gateway\
```

### Reglas

1. **El nombre de la carpeta es el nombre del repo.** No hay alias: si el repo es
   `protos`, la doc también lo llama `protos`.
2. **Una sola fuente de verdad por tema.** Nada de clones viejos «de referencia»
   dentro del árbol: si hace falta una versión vieja se usa `git worktree` o un tag.
3. **La copia principal de cada repo se queda en `main` y limpia.** Nadie (ni
   humano ni agente) trabaja features ahí; sirve para leer y para crear worktrees.
4. **El trabajo vive en `worktrees\issue-<n>\`.** Un issue que toca tres repos
   tiene tres worktrees bajo la misma carpeta. Al cerrar el issue se borra la
   carpeta entera (`git worktree remove`).
5. **Nada de archivos sueltos en la raíz** (PDFs, Excel, prompts). Van a `docs\`
   o a `tools\` según corresponda.

## Contexto para agentes (`CLAUDE.md` en capas)

Claude Code lee el `CLAUDE.md` del directorio donde arranca **y el de cada carpeta
padre**. Se aprovecha para no repetir reglas:

| Nivel | Contiene | Tamaño guía |
|---|---|---|
| `<org>\CLAUDE.md` | Mapa de repos, flujo de issues, nombres de ramas y commits, dónde está la doc | ≤ 150 líneas |
| `backend\CLAUDE.md` | Arquitectura hexagonal, errores, tests, protos, deploy | ≤ 200 líneas |
| `frontend\CLAUDE.md` | Stack, estructura de `src/app`, estilos, cómo pedir endpoints | ≤ 150 líneas |
| `<repo>\CLAUDE.md` | Sólo lo propio del repo: puerto, schema, dependencias, particularidades | ≤ 200 líneas |

Los `CLAUDE.md` de nivel `<org>`, `backend` y `frontend` no están en ningún repo.
Se versionan en `plantillas\workspace\` y se copian con `scripts\bootstrap`.

Lo que **no** va en un `CLAUDE.md`: historial de incidentes, decisiones con su
contexto (→ ADR en `docs\`), changelogs, notas de un issue (→ el issue).

## Arranque de una máquina nueva

```powershell
git clone <url>/dev-plantillas C:\dev\<org>\plantillas
C:\dev\<org>\plantillas\scripts\bootstrap.ps1 -Org <org>   # crea carpetas, copia CLAUDE.md, clona repos
```
