# Hoja de ruta

Estado de `dev-plantillas` y qué sigue, en orden de prioridad. Cada pieza tiene
su especificación en `docs/`; acá sólo el estado y el orden.

Leyenda: ✅ publicada · 🔨 en construcción · 📐 especificada · 💭 idea

## Estado actual

### Plantillas

| Plantilla | Estado | Versión | Spec |
|---|---|---|---|
| `go-grpc-service` | ✅ | v0.2.1 | `docs/04` |
| `protos` | ✅ | v0.2.0 | — |
| `api-gateway` (fase 1) | ✅ | v0.1.0 | `docs/05` |
| `angular-app` | ✅ | v0.2.0 | `docs/07` |
| `docs` | ✅ | v0.1.0 | `docs/06` |
| `astro-site` | 🔨 | — | `docs/07` |
| `android-app` | 🔨 | — | `docs/09` |
| `e2e-tests` | 🔨 | — | `docs/12` |
| `observabilidad-stack` | 📐 | — | `docs/14` |
| `react-app` | 📐 | — | `docs/07`, `docs/13` |
| `python-grpc-service` | 💭 | — | `docs/13` |
| `ts-grpc-service` | 💭 | — | `docs/13` |

### Herramientas y capas comunes

| Pieza | Estado | Spec |
|---|---|---|
| Plugin `dev-agentes`: `/verificar`, hooks `guard-worktree` y `format` | ✅ | `plugins/dev-agentes` |
| Destinos de deploy Google / Coolify y migración entre ellos | ✅ | `docs/04` |
| Base común de repos (seguridad, Renovate, releases, conexión con docs) | 📐 | `docs/10` |
| Repo `ci` de pipelines reutilizables | 📐 | `docs/11` |
| Pruebas en el flujo (estándar) | 📐 | `docs/12` |
| Observabilidad | 📐 | `docs/14` |
| CLI `dp` | 🔨 H1 (en pair) | `docs/08` |

## Próximo (en este orden)

1. **Terminar lo que está en construcción:** `astro-site`, `android-app`,
   `e2e-tests`; publicarlas y sumarlas al catálogo.
2. **Base común, fase 1** sobre todas las plantillas: gitleaks (pre-commit + CI),
   `.gitignore` de secretos, `SECURITY.md`, `CODEOWNERS`, plantilla de MR/PR
   común, chequeo del título del PR. — `docs/10` §9
3. **CLI `dp` H1–H2** (`list` y `new`): a partir de acá `dp` reemplaza los
   comandos largos de Copier. — `docs/08` §9
4. **Observabilidad, fase 1:** trazas + logs correlacionados en `go-grpc-service`
   y `api-gateway`; `observabilidad-stack` mínimo. — `docs/14` §11
5. **Recorrido de punta a punta:** un proyecto demo construido con todas las
   plantillas y desplegado en Coolify; documenta y prueba que todo encaja.

## Después

| Pieza | Spec |
|---|---|
| Base común fases 2–5: manifiesto `.dp/repo.yaml` + `sincronizar` en docs, Renovate, release-please, `dp repo proteger` | `docs/10` |
| Repo `ci` y migración de las plantillas a CI compartido (`ci_modo`) | `docs/11` |
| CLI `dp` H3–H10: `doctor`, catálogo remoto, workspace, issues, `update --all`, `--remoto`, mantenimiento de plantillas, skills sobre `dp --json` | `docs/08` |
| Gateway fase 2 (`protovalidate`, circuit breaker), fase 3 (Redis), fase 4 (GraphQL) | `docs/05` |
| Observabilidad fases 2–4: métricas RED, SLOs y alertas, destino Google, front y móvil | `docs/14` |
| `e2e-tests` disparada desde los deploys a QA (requiere `ci`) | `docs/12` |
| Plugin: `/issue-start`, `/cerrar-issue`, `/nuevo-proyecto`; revisores `go-reviewer` (ejercicio), `android-reviewer`, `front-reviewer`, `migration-reviewer` | `docs/03`, `docs/09` |

## Más adelante (cuando un proyecto lo pida)

- `react-app`, `python-grpc-service`, `ts-grpc-service`.
- Kotlin Multiplatform para sumar iOS a `android-app`.
- Adaptador SOAP (Java) para el gateway.
- Plantilla de Supabase (alternativa documentada en `docs/04`).

## Presentación pública

- README en inglés (o bilingüe), con un GIF de `dp new`.
- Página del proyecto construida con `astro-site`.
- Releases de GitHub con notas en cada versión de plantilla.

## Cómo se actualiza este archivo

Al mergear un PR que cambia el estado de una pieza, se actualiza su fila en el
mismo PR. Lo que entra o sale de «Próximo» se decide explícitamente.
