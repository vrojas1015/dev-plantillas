# Pipelines reutilizables: repo `ci`

Especificación (pendiente de construir) del repo de pipelines compartidos. Es
una **librería versionada**, no una plantilla de proyecto: los repos la usan,
no la copian.

## 1. Problema

Hoy cada plantilla genera su CI completo (100–300 líneas) y cada repo tiene su
copia. Cambiar la autenticación con GCP, subir la versión de Trivy o agregar
gitleaks obliga a tocar todos los repos. El propio CI de `dev-plantillas`
repite los mismos pasos en cada job.

## 2. Solución

Un repo `ci` con pipelines reutilizables para los dos proveedores:

| Proveedor | Mecanismo | Uso desde un repo |
|---|---|---|
| GitHub | Reusable workflows | `uses: <owner>/ci/.github/workflows/go-service.yml@v1` |
| GitLab | CI/CD components (catálogo) | `include: - component: gitlab.com/<org>/ci/go-service@1.0.0` |

El CI de un repo generado pasa a ~15 líneas:

```yaml
# .github/workflows/ci.yml de un servicio
name: ci
on:
  pull_request:
  push: { tags: ["qa-v*", "prod-v*"] }
jobs:
  servicio:
    uses: vrojas1015/ci/.github/workflows/go-service.yml@v1
    with:
      servicio: orders-service
      deploy: cloud-run
    secrets: inherit
```

## 3. Piezas

### Pipelines completos (uno por plantilla)

| Pipeline | Etapas |
|---|---|
| `go-service` | calidad → tests (unit + integración con Postgres) → seguridad → imagen → deploy QA (tag `qa-v*`) → pruebas en QA → deploy prod (tag `prod-v*`, aprobación, guard de migraciones) → smoke en prod |
| `api-gateway` | lo de `go-service` + tests de autorización por ruta + contrato OpenAPI |
| `protos` | lint → breaking → generar sin diff → compilar por lenguaje → publicar paquetes (tag) |
| `angular` / `astro` | calidad → tests → build → (astro) test de SEO + Lighthouse → deploy |
| `android` | calidad → tests JVM → bundle firmado → pista interna / producción |
| `docs` | validar → generar sin diff → construir → deploy |
| `e2e` | suites del repo `e2e-tests` contra un ambiente (ver `docs/12`) |

### Bloques reutilizables (los usan los pipelines y se pueden usar sueltos)

| Bloque | Qué hace |
|---|---|
| `secretos` | gitleaks sobre el diff completo |
| `titulo-pr` | Conventional Commits + número de issue |
| `vulnerabilidades` | govulncheck / osv-scanner según el lenguaje |
| `imagen` | build + Trivy (falla en HIGH/CRITICAL con fix) + push |
| `deploy-cloud-run` | WIF + `gcloud run services replace` |
| `deploy-coolify` | push al registry + webhook de Coolify v4 |
| `deploy-firebase-hosting` | WIF + `firebase deploy --only hosting` |
| `release` | release-please |
| `smoke` | requests básicos contra una URL después de un deploy; falla el pipeline si no responde |

## 4. Reglas

- **Versionado semántico** con tags (`v1.2.3`) y tags mayores móviles (`v1`).
  Los repos se fijan a la mayor (`@v1`) y reciben arreglos solos; un cambio
  incompatible es `v2` y se adopta con un MR por repo (Renovate lo propone).
- **Sin secretos en el repo `ci`**: los pipelines reciben secretos y variables
  del repo que los llama (`secrets: inherit` / variables de grupo en GitLab).
- **Entradas documentadas y validadas** (`inputs` con tipo y default); un input
  desconocido es error.
- **Permisos mínimos** declarados en cada workflow.
- **Probados**: el repo `ci` tiene su propio CI que ejecuta cada pipeline contra
  proyectos generados con las plantillas (lo que hoy hace `templates.yml`).
- Las acciones de terceros se fijan por **SHA**, no por tag.

## 5. Migración de las plantillas

1. Construir `ci` con los pipelines equivalentes a lo que hoy generan las
   plantillas (mismo comportamiento, probado contra proyectos generados).
2. Pregunta nueva en cada plantilla: `ci_modo: compartido | completo`
   (default `compartido`). `completo` mantiene el CI generado entero para quien
   no quiere depender de un repo externo.
3. `copier update` en los repos existentes cambia el CI largo por el corto.
4. El CI de `dev-plantillas` usa los pipelines de `ci` en vez de repetir pasos.

## 6. Criterios de terminado

- [ ] Un servicio generado con `ci_modo: compartido` tiene un CI de ≤ 20 líneas
      y hace lo mismo que el CI completo (mismos jobs, mismos resultados) en
      GitHub y en GitLab.
- [ ] Publicar `v1.0.1` del repo `ci` con un cambio → un repo fijado en `@v1`
      lo usa sin tocar nada.
- [ ] Un input mal escrito → el pipeline falla con un mensaje claro.
- [ ] Ningún secreto en el repo `ci`; acciones de terceros fijadas por SHA.
- [ ] `copier update` de `completo` a `compartido` sin conflictos.
