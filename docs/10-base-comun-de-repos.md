# Base común de repos

Lo que **todos** los repos generados con `dev-plantillas` comparten,
independientemente del lenguaje: seguridad, mantenimiento, releases y la
conexión con el repo de documentación. Especificación (pendiente de construir).

Hoy cada plantilla resuelve estas cosas por su cuenta, o no las resuelve. La
base común las define una vez y las plantillas la incluyen.

## 1. Cómo se implementa

Una carpeta compartida `templates/_base/` con los archivos comunes. Cada
plantilla la incluye en su `template/` (con un script de sincronización en
`dev-plantillas` que copia `_base` a cada plantilla antes de publicar, y un
chequeo en el CI que falla si alguna quedó desactualizada).

Así un repo generado recibe la base como parte de su plantilla, y **`copier
update` propaga los cambios** de la base a los repos existentes, igual que
cualquier otro cambio de la plantilla.

Preguntas nuevas, comunes a todas las plantillas:

```
dueño:          backend                 # equipo o persona responsable (CODEOWNERS)
docs_repo:      https://gitlab.com/mi-org/docs   # vacío si no hay repo de documentación
licencia:       privada | MIT | Apache-2.0
```

## 2. Seguridad

| Pieza | Qué hace | Dónde corre |
|---|---|---|
| **gitleaks** | Busca secretos (claves, tokens, JSON de cuentas de servicio) | Pre-commit **y** CI. En el CI revisa todo el diff del MR/PR, no sólo el último commit |
| `.gitignore` de secretos | Ignora `*.pem`, `*.p12`, `*.jks`, `*-adminsdk-*.json`, `google-services.json`, `.env*` (salvo `.env.example`) | Siempre |
| **Escaneo de dependencias** | `govulncheck` (Go), `npm audit --omit=dev` / `osv-scanner` (JS, Python, JVM) | CI; falla en HIGH/CRITICAL con fix disponible |
| **Escaneo de imagen** | Trivy sobre la imagen que se despliega (ya en `api-gateway`) | CI, en plantillas con Docker |
| `SECURITY.md` | Cómo reportar una vulnerabilidad y qué esperar | Repo |
| Permisos mínimos en CI | `permissions:` explícitos en GitHub Actions; tokens de job con alcance mínimo en GitLab | CI |

**Qué hacer si gitleaks encuentra algo ya commiteado:** el secreto se considera
comprometido. Se **rota** primero (clave nueva, revocar la vieja) y después se
limpia del repo. Borrarlo del historial sin rotarlo no sirve. Está en
`SECURITY.md` y en un runbook del repo de docs.

## 3. Mantenimiento de dependencias

**Renovate** (funciona igual en GitLab y GitHub; Dependabot sólo en GitHub):

- Agrupado por ecosistema y por tipo: un MR semanal con todos los *minor/patch*;
  los *major* de a uno.
- *Automerge* de patches de dependencias de desarrollo si el CI pasa.
- Las imágenes Docker fijadas por digest también se actualizan.
- Configuración compartida en un preset (`renovate-config` en el repo de
  plataforma) y cada repo sólo lo extiende: un cambio de política se hace una vez.

## 4. Protección de ramas y repo

Los ajustes de `docs/02-repositorios-gitlab-github.md` §4 dejan de hacerse a
mano: **`dp repo proteger`** los aplica por API (`gh` / `glab`) y `dp repo
revisar` muestra las diferencias contra lo esperado.

| Ajuste | Valor |
|---|---|
| Rama `main` | Sin push directo; merge sólo por MR/PR |
| Requisitos de merge | CI verde + 1 aprobación + conversaciones resueltas |
| Tags `prod-v*` | Sólo mantenedores |
| Ramas mergeadas | Se borran solas |
| Force push | Bloqueado en `main` |

`CODEOWNERS` generado desde la pregunta `dueño` (se puede refinar por carpeta).

## 5. Commits, PRs y releases

| Pieza | Regla |
|---|---|
| Mensajes | **Conventional Commits** con el issue: `feat(issue-42): tope de descuento por pedido` |
| Chequeo | El CI valida el **título del MR/PR** (que es lo que queda al hacer squash) |
| Plantilla de MR/PR | Qué cambia, issue de docs enlazado, cómo se probó, migraciones, checklist de seguridad |
| Releases | **release-please**: abre un PR de release con la versión siguiente (según los tipos de commit) y el `CHANGELOG.md`; al mergearlo crea el tag. Para servicios, el tag `vX.Y.Z` convive con los de deploy (`qa-v*`, `prod-v*`) o los reemplaza (decisión por plantilla, documentada) |

## 6. Pre-commit unificado

Un solo `.pre-commit-config.yaml` (framework `pre-commit`, funciona en Windows,
macOS y Linux):

- Comunes: gitleaks, fin de línea y espacios finales, YAML/JSON válidos,
  archivos grandes (> 1 MB) bloqueados, conflictos de merge sin resolver.
- Por plantilla: el formateador y linter de su lenguaje (gofmt/golangci-lint,
  prettier/eslint, ruff, ktlint).
- El CI corre los mismos hooks (`pre-commit run --all-files`), así que saltearlos
  en local no sirve.

## 7. Conexión con el repo de documentación

La pregunta es cómo se mantienen sincronizados los repos de código y el repo
de `docs` sin duplicar información ni acoplarlos demasiado.

### Principios

1. **Cada dato tiene un solo dueño.** Lo que describe a un repo (qué es, de qué
   plantilla salió, de qué depende) lo declara **el propio repo**. Lo que cruza
   repos (issues, ADRs, arquitectura, releases de la plataforma) vive en `docs`.
2. **`docs` lee de los repos; los repos no escriben en `docs`.** Un modelo de
   *pull*: un solo token de **sólo lectura** en el CI de `docs`, en vez de tokens
   con permiso de escritura repartidos en cada repo.
3. **Los enlaces van en los dos sentidos**, pero el contenido no se copia.

### Manifiesto del repo: `.dp/repo.yaml`

Cada plantilla genera este archivo, que es la fuente de verdad de la ficha del
servicio:

```yaml
nombre: orders-service
tipo: servicio-go          # mismos valores que la ficha de servicio de docs
descripcion: Pedidos, descuentos y estado de pago.
dueño: backend
depende_de: [protos]       # repos de los que depende
docs: https://docs.mi-org.com/servicios/orders-service/
```

- La **plantilla y su versión** no se repiten: salen de `.copier-answers.yml`.
- `consumido_por` no se declara: `docs` lo calcula invirtiendo `depende_de`.
- El CI del repo valida el manifiesto (esquema) y que `nombre` coincida con el
  nombre del repo.

### Qué hace `docs` con los manifiestos

El job `sincronizar` del repo de docs (programado, p. ej. cada noche, y manual):

1. Para cada repo de la organización (o de una lista), lee por API `.dp/repo.yaml`,
   `.copier-answers.yml` y los últimos tags.
2. Actualiza el **frontmatter** de `contenido/servicios/<repo>.md` (tipo, dueño,
   dependencias, plantilla y versión, última versión publicada). **El cuerpo
   de la ficha no se toca**: lo escriben personas.
3. Si hay repos sin ficha, la crea desde la plantilla de ficha.
4. Regenera `_generado/` (mapa de servicios, versiones de plantilla por repo).
5. Abre un MR/PR con los cambios (no pushea directo a `main`).

Resultado: el mapa de servicios y el inventario de qué repo usa qué versión de
qué plantilla se mantienen solos. Y `dp status` puede leer lo mismo.

### Issues ↔ código

| Dirección | Mecanismo |
|---|---|
| Código → issue | La rama (`feat/issue-42-…`) y el título del MR/PR (`feat(issue-42): …`) llevan el número; el CI lo exige. La plantilla de MR/PR tiene el enlace al issue en `docs` (armado con `docs_repo`) |
| Issue → código | La sección **Verificación** del issue (la escribe `/verificar`) registra repo, commit y MR/PR. Opcional: `sincronizar` lista los MR/PR abiertos y mergeados que mencionan `issue-42` |

### Qué va en cada lado (recordatorio de `docs/06` §2)

| Repo de código | Repo `docs` |
|---|---|
| `README.md` (cómo correrlo), `CLAUDE.md`, `docs/` de uso y deploy, `CHANGELOG.md` (lo genera release-please), `.dp/repo.yaml` | Ficha del servicio (cuerpo escrito por personas + frontmatter sincronizado), issues, ADRs, runbooks, releases de la plataforma |

El README de cada repo enlaza a su ficha en `docs` (desde `docs` en el
manifiesto); la ficha enlaza al README.

### Por qué no al revés (los repos escribiendo en `docs`)

| Push (cada repo escribe en docs al hacer release) | Pull (docs lee de los repos) |
|---|---|
| Token con escritura en `docs` en cada repo: muchas credenciales que pueden filtrarse | Un token de sólo lectura, en un solo lugar |
| Releases simultáneos de varios repos compiten por el mismo archivo: el problema del rollout compartido otra vez | Un solo job escribe, en un solo MR/PR |
| Si docs está caído, el release del repo falla | Los repos no dependen de docs |
| Información al instante | Información con algunas horas de atraso (aceptable para documentación; para urgencias, ejecución manual) |

## 8. Plantilla de MR/PR común

```markdown
## Qué cambia
<!-- Una o dos líneas -->

Issue: <docs_repo>/…/issues/<n>-…  <!-- obligatorio salvo chore/deps -->

## Cómo se probó
- [ ] Tests / build
- [ ] Probado a mano (qué)

## Checklist
- [ ] Sin secretos ni datos personales en el diff
- [ ] Migraciones: tienen `down` / no aplica
- [ ] Docs del repo actualizadas / no aplica
- [ ] Ficha o ADR en `docs` actualizados / no aplica
```

Cada plantilla agrega su sección propia (p. ej. `api-gateway`: rutas nuevas en
`routes.yaml`; `astro-site`: Lighthouse).

## 9. Fases

| Fase | Contenido |
|---|---|
| 1 | `_base` + sincronización a cada plantilla; gitleaks (pre-commit + CI); `.gitignore` de secretos; `SECURITY.md`; `CODEOWNERS`; plantilla de MR/PR común; chequeo del título |
| 2 | `.dp/repo.yaml` en cada plantilla + job `sincronizar` en la plantilla `docs` |
| 3 | Renovate con preset compartido; escaneo de dependencias por lenguaje |
| 4 | release-please; pre-commit unificado |
| 5 | `dp repo proteger` / `dp repo revisar` (junto con los hitos de la CLI) |

## 10. Criterios de terminado

- [ ] Todas las plantillas incluyen `_base`; el CI de `dev-plantillas` falla si
      una quedó desactualizada.
- [ ] En un repo generado, commitear un archivo con una clave falsa con forma
      real → pre-commit lo bloquea; con el hook salteado, el CI falla.
- [ ] Un MR/PR con título sin tipo o sin issue → el CI falla con el formato
      esperado (salvo `chore(deps)`).
- [ ] `copier update` de un repo existente trae la base sin conflictos.
- [ ] `.dp/repo.yaml` validado en el CI del repo; nombre distinto al del repo → falla.
- [ ] `sincronizar` en `docs`, contra dos repos de prueba: crea la ficha que
      falta, actualiza el frontmatter de la otra **sin tocar su cuerpo**,
      calcula `consumido_por` y abre un MR/PR. Con sólo un token de lectura.
- [ ] Renovate abre el MR agrupado en un repo de prueba.
- [ ] release-please abre el PR de release con el changelog a partir de
      Conventional Commits.
- [ ] `dp repo proteger` aplica la protección y `dp repo revisar` reporta cero
      diferencias después.
