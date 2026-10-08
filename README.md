# dev-plantillas

Estándar de desarrollo del equipo: plantillas para crear proyectos nuevos y las
guías de cómo se organizan carpetas, repos y trabajo con agentes.

## Contenido

| Ruta | Qué es |
|---|---|
| `templates/go-grpc-service/` | Plantilla Copier: microservicio Go gRPC hexagonal + Postgres + Cloud Run |
| `templates/angular-app/` | Plantilla Copier: app Angular standalone + signals + Firebase Hosting |
| `plugins/dev-agentes/` | Plugin de Claude Code: skills, agentes y hooks del flujo de trabajo |
| `.claude-plugin/` | Marketplace: permite instalar el plugin con `/plugin marketplace add vrojas1015/dev-plantillas` |
| `workspace/` | `CLAUDE.md` en capas (plataforma, backend, frontend) y lista de repos |
| `scripts/bootstrap.ps1` | Arma `C:\dev\<org>` en una máquina nueva |
| `scripts/new-worktree.ps1` | Crea los worktrees de un issue |
| `scripts/publish-template.sh` | Publica una plantilla en su propio repo con tag |
| `docs/01-estructura-de-carpetas.md` | Layout local del equipo |
| `docs/02-repositorios-gitlab-github.md` | Organización, nombres, protección y CI en GitLab/GitHub |
| `docs/03-flujo-de-trabajo.md` | Issue → worktree → sesión → MR, con varios agentes en paralelo |

## Requisitos

- Git, Python 3.10+ con `pip install copier`
- Go (backend) y Node 24+ (frontend)
- `glab` y/o `gh`

## Uso rápido

```powershell
# Máquina nueva
git clone <url>/dev-plantillas C:\dev\<org>\plantillas
C:\dev\<org>\plantillas\scripts\bootstrap.ps1 -Org <org>

# Servicio nuevo
python -m copier copy --vcs-ref v1.0.0 <url>/template-go-grpc-service C:\dev\<org>\backend\agenda-service

# App nueva
python -m copier copy --vcs-ref v1.0.0 <url>/template-angular-app C:\dev\<org>\frontend\admin-web

# Traer mejoras de la plantilla a un repo existente
cd C:\dev\<org>\backend\agenda-service; python -m copier update
```

## Cambiar una plantilla

1. Rama en este repo, cambio en `templates/<nombre>/`.
2. Generar un proyecto de prueba y verificar (build + tests); cada plantilla
   documenta cómo en su `README.md`.
3. MR. Al mergear: `scripts/publish-template.sh <nombre> vX.Y.Z <remote>`.
4. Los repos existentes lo adoptan con `copier update` en una rama propia.
