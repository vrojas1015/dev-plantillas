# Repositorios en GitLab y GitHub

Cómo se crean y configuran los repos. Vale para los dos proveedores; donde
difieren hay una tabla.

## 1. Organización

```
<org>/                      GitLab: grupo        · GitHub: organización
├── backend/                GitLab: subgrupo     · GitHub: team "backend" + topic
│   ├── protos
│   ├── api-gateway
│   └── <dominio>-service
├── frontend/
│   └── <app>
├── platform/
│   ├── ci-templates        ← pipelines reutilizables (ver §5)
│   ├── dev-plantillas      ← este repo: guías + archivos del workspace
│   ├── template-go-grpc-service
│   └── template-angular-app
├── docs
└── tools
```

GitHub no tiene subgrupos: los repos quedan planos en la organización. Se agrupan
con **teams** (permisos) y **topics** (`backend`, `frontend`, `go-service`).

## 2. Nombres

| Tipo | Patrón | Ejemplo |
|---|---|---|
| Microservicio | `<dominio>-service` | `agenda-service` |
| Gateway | `api-gateway` | — |
| Contratos | `protos` | — |
| App front | `<audiencia>-<tipo>` | `admin-web`, `landing` |
| Librería | `<lang>-<tema>` | `go-commons` |

- Siempre `kebab-case`, en inglés, sin el nombre de la empresa (ya está en el grupo).
- El nombre del repo = carpeta local = nombre del servicio en Cloud Run = imagen.
- Rama por defecto: `main`.

## 3. Ramas, commits y versiones

| Qué | Convención |
|---|---|
| Rama de trabajo | `feat/issue-<n>-<slug>`, `fix/issue-<n>-<slug>`, `chore/<slug>` |
| Commit | `<tipo>(issue-<n>): <qué cambia>` — una línea ≤ 72 + cuerpo con el porqué |
| Merge | Siempre por MR/PR. Squash opcional; el título del MR va al changelog |
| Versión de servicio | Tag `qa-vX.Y.Z` despliega a QA · `prod-vX.Y.Z` a producción |
| Versión de librería/protos | SemVer `vX.Y.Z` |

El cuerpo largo del commit no reemplaza al issue: el contexto completo (decisiones,
cómo se probó) vive en el issue y el commit lo referencia.

## 4. Configuración obligatoria de cada repo

| Ajuste | GitLab | GitHub |
|---|---|---|
| Proteger `main` | Settings › Repository › Protected branches: push = *No one*, merge = Maintainers/Developers | Rulesets: require PR, block force push |
| Requerir pipeline verde | Settings › Merge requests › *Pipelines must succeed* | Ruleset › *Require status checks* |
| Requerir aprobación | Settings › Merge requests › Approvals (≥ 1) | Ruleset › *Required approvals* (≥ 1) |
| Tags de producción | Protected tags: `prod-v*` → Maintainers | Ruleset de tags: `prod-v*` restringido |
| Borrar rama al mergear | *Delete source branch* por defecto | *Automatically delete head branches* |
| Credenciales de deploy | Variables CI/CD a nivel **grupo** + WIF (OIDC), sin claves JSON | Variables de **org/environment** + WIF (OIDC) |
| Dependencias privadas | Allowlist de `CI_JOB_TOKEN` en el repo dependido | `GITHUB_TOKEN` con acceso al repo, o app token |
| Template de MR/PR | `.gitlab/merge_request_templates/Default.md` | `.github/pull_request_template.md` |

Los templates de MR/PR y los archivos de CI ya vienen en las plantillas.

## 5. CI reutilizable en vez de copiado

Hoy cada micro tiene su propio `.gitlab-ci.yml` copiado de otro, y las mejoras no
se propagan. Se centraliza en `platform/ci-templates`:

| | GitLab | GitHub |
|---|---|---|
| Mecanismo | **CI/CD components** (`include: component: gitlab.com/<org>/platform/ci-templates/go-service@1.0.0`) | **Reusable workflows** (`uses: <org>/ci-templates/.github/workflows/go-service.yml@v1`) |
| Versión | Tag del repo de componentes | Tag del repo de workflows |

El `.gitlab-ci.yml` de cada servicio queda en ~10 líneas: el `include` y sus
variables (nombre, puerto). Un cambio en el pipeline se publica una vez, como un
nuevo tag, y cada repo lo adopta subiendo la versión del `include`.

> Fase 2: las plantillas generan hoy el pipeline completo para que funcionen
> solas. Cuando exista `ci-templates`, la plantilla pasa a generar sólo el `include`.

## 6. Crear un repo nuevo (paso a paso)

```powershell
# 1. Generar el código desde la plantilla (siempre desde un tag publicado)
python -m copier copy --vcs-ref v1.0.0 https://gitlab.com/<org>/platform/template-go-grpc-service.git C:\dev\<org>\backend\agenda-service

# 2. Crear el repo remoto vacío
glab repo create <org>/backend/agenda-service --private --defaultBranch main     # GitLab
gh repo create <org>/agenda-service --private --source . --push                  # GitHub

# 3. Primer push
git -C C:\dev\<org>\backend\agenda-service push -u origin main

# 4. Aplicar los ajustes de §4 (una vez; se puede scriptear con la API)
# 5. Infra: seguir docs/ci-cd-setup.md del repo generado (WIF, SA, secrets)
```

## 7. Mantener los repos al día con la plantilla

```powershell
cd C:\dev\<org>\backend\agenda-service
python -m copier update        # aplica los cambios nuevos de la plantilla como diff
```

Copier guarda en `.copier-answers.yml` de qué versión salió el repo. `update`
trae sólo lo que cambió en la plantilla desde entonces y respeta lo propio del
repo; los conflictos se resuelven como un merge normal. Se corre en una rama y
entra por MR como cualquier cambio.

## 8. GitLab o GitHub

Si el equipo ya está en GitLab con CI keyless funcionando, **no hay motivo para
migrar**. GitHub conviene si se necesita Copilot/Actions marketplace o si el
equipo crece con gente que ya trabaja ahí. Las plantillas soportan ambos
(`ci_provider` en Copier), así que la decisión no bloquea nada.

| | GitLab | GitHub |
|---|---|---|
| Subgrupos | Sí | No (teams + topics) |
| CLI | `glab` | `gh` |
| Template repos nativos | Sólo en Premium (*group templates*) | Gratis (*Template repository*) |
| CI reutilizable | CI/CD components | Reusable workflows |
| OIDC a GCP | `id_tokens` | `permissions: id-token: write` |

**Cada plantilla es su propio repo.** Copier versiona por tags de git y sólo
puede hacer `update` si la plantilla está en la raíz de un repo. En
`dev-plantillas/templates/` se desarrollan juntas y se publican por separado
(`scripts/publish-template`).

Con Copier no hace falta el «template repository» nativo de ninguno de los dos:
funciona igual en ambos y además permite `update`.
