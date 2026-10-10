# Plantilla: app frontend Angular

Plantilla [Copier](https://copier.readthedocs.io/) para apps frontend del equipo:
Angular 21 standalone + signals, SCSS/BEM, cliente API tipado, Firebase Auth + JWT
propio (opcional), @ngx-translate (opcional), vitest + Playwright, y CI/CD en
GitLab o GitHub con deploy keyless a Firebase Hosting o a Coolify v4 en un VPS
propio (opcional).

Está extraída del patrón de la app de admin existente, sin nombres ni IDs reales.

## Qué genera

```
<app>/
├── CLAUDE.md                     contexto corto para agentes (stack, estructura, reglas)
├── .claude/settings.json         permisos allow/deny para Claude Code
├── .gitlab-ci.yml | .github/     CI: MR/PR → lint + unit + build; deploy según deploy_target
├── docs/ci-cd-setup.md           setup de una vez del deploy elegido + variables del CI
├── docs/migrar-a-firebase-hosting.md   (si deploy_target = coolify)
├── docs/estilos-bem.md           convención SCSS + BEM
├── firebase.json, .firebaserc    (si deploy_target = firebase-hosting)
├── Dockerfile, Caddyfile,        (si deploy_target = coolify) imagen node:24 → caddy:2-alpine
│   .dockerignore, docker-compose.yml
├── e2e/items.spec.ts             e2e de ejemplo (Playwright, API mockeada)
├── public/i18n/<lang>.json       (si i18n)
└── src/
    ├── environments/             environment.ts (dev) · .qa.ts · .prod.ts
    ├── styles/                   tokens, reset, tipografía, mixins
    └── app/
        ├── api/                  RestClient, DomainError, interceptores, SKIP_AUTH
        ├── core/                 auth (SessionStore, AuthService, guard) · i18n
        ├── features/items/       ejemplo: lista + detalle con store de signals y client tipado
        ├── features/auth/        login (si use_firebase_auth)
        ├── layout/shell/         header + nav + outlet
        └── ui/components/button/ componente ui de ejemplo
```

## Preguntas

| Pregunta | Default | Para qué |
|---|---|---|
| `app_name` | — | kebab-case; nombre del repo, del proyecto Angular y de `dist/<app_name>` |
| `app_title` | derivado de `app_name` | título visible (header, `<title>`) |
| `api_base_url_qa` | `https://api-qa.example.com` | API de dev y QA |
| `api_base_url_prod` | `https://api.example.com` | API de producción |
| `use_firebase_auth` | `true` | login Firebase → JWT propio (access en memoria, refresh en localStorage) + interceptor + guard. Independiente del destino de deploy |
| `deploy_target` | `firebase-hosting` | `firebase-hosting`, `coolify` o `ninguno` (CI sólo verifica). Ver "Destinos de deploy" |
| `firebase_project_qa` / `_prod` | `<app_name>-qa` / `-prod` | IDs de proyecto GCP/Firebase (sólo si auth o deploy a Firebase) |
| `ci_provider` | `gitlab` | `gitlab` o `github` |
| `dueño` | `@mi-org/frontend` | `CODEOWNERS` y `SECURITY.md` (`@usuario` o `@org/equipo`; base común, `docs/10` de dev-plantillas) |
| `docs_repo` | vacío | URL del repo de docs: la plantilla de MR/PR enlaza la carpeta del issue ahí |
| `i18n` | `true` | textos vía @ngx-translate |
| `default_lang` | `es` | `<html lang>`, idioma de i18n y locale de Playwright |

No se pregunta ni se genera ningún secreto, número de proyecto, audience de WIF,
email de service account ni token/UUID de Coolify: son variables del CI documentadas
en `docs/ci-cd-setup.md`.

## Destinos de deploy

| | `firebase-hosting` | `coolify` | `ninguno` |
|---|---|---|---|
| Dónde | Firebase Hosting (CDN de Google) | Coolify v4 en un VPS propio | — |
| Artefacto | `dist/<app>/browser` + `firebase.json` | imagen Docker: build con `node:24`, sirve `caddy:2-alpine` (`Caddyfile`: fallback SPA, gzip/zstd, cache) | — |
| QA | tag `qa-vX.Y.Z` | tag `qa-vX.Y.Z` → imagen `APP_ENV=qa` | — |
| Producción | push/merge a `main` | tag `prod-vX.Y.Z` → imagen `APP_ENV=prod` | — |
| Credenciales del CI | WIF (OIDC, sin claves): `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL` | registry con `GITHUB_TOKEN` / `CI_JOB_TOKEN`; `COOLIFY_URL`, `COOLIFY_RESOURCE_UUID`, `COOLIFY_TOKEN` (secreto) por environment | — |
| Archivos propios | `firebase.json`, `.firebaserc`, scripts `deploy:*` | `Dockerfile`, `Caddyfile`, `.dockerignore`, `docker-compose.yml`, `docs/migrar-a-firebase-hosting.md` | — |

Con `coolify`, Angular hornea el environment en el bundle: hay **una imagen por
ambiente** (build arg `APP_ENV=qa|prod`), no una imagen promovida entre ambientes.

### Cambiar de destino (p. ej. `coolify` → `firebase-hosting`)

```powershell
git switch -c chore/migrar-a-firebase-hosting
python -m copier update --defaults --data deploy_target=firebase-hosting `
  --data firebase_project_qa=<id-qa> --data firebase_project_prod=<id-prod>
```

Los `--data firebase_project_*` sólo hacen falta si el proyecto no usaba Firebase
Auth (si no, ya están en `.copier-answers.yml`). `--vcs-ref=:current:` cambia el
destino sin subir de versión de plantilla. En un proyecto sin modificar el update no
da conflictos: aparecen `firebase.json`/`.firebaserc`, desaparecen los archivos de
Coolify (**aunque se hayan editado a mano**: revisar `git diff`) y el resultado es
idéntico a generar con `firebase-hosting` desde cero. Paso a paso completo (WIF, QA,
corte de DNS, rollback): `docs/migrar-a-firebase-hosting.md` del proyecto generado.

## Generar

Requisitos: Python con `copier>=9` (`pip install copier`), Node 24, npm 11.

```powershell
# Desde un clon de dev-plantillas
python -m copier copy C:\dev\<org>\plantillas\templates\angular-app C:\dev\<org>\frontend\<app>

# No interactivo
python -m copier copy --defaults `
  --data app_name=admin-web --data "app_title=Admin" `
  --data ci_provider=gitlab --data use_firebase_auth=true `
  C:\dev\<org>\plantillas\templates\angular-app C:\dev\<org>\frontend\admin-web
```

## Actualizar un proyecto generado

```powershell
cd C:\dev\<org>\frontend\<app>
python -m copier update            # trae cambios de la plantilla; conflictos como .rej / marcadores
python -m copier update --data i18n=false   # cambiar una respuesta
```

`copier update` necesita que la plantilla esté **versionada en git en la raíz de un
repo, con tags** (Copier guarda `_commit` en `.copier-answers.yml`). Generada desde esta
subcarpeta de `dev-plantillas`, la copia funciona pero queda sin `_commit` y no se
puede actualizar. Por eso el destino previsto es el repo propio
`platform/template-angular-app` (ver `docs/02-repositorios-gitlab-github.md`), con tags
SemVer (`v1.0.0`). El proyecto tiene que estar commiteado y limpio antes de actualizar.

## Después de generar (checklist)

1. `git init -b main` (si hace falta), `npm install` y **commitear `package-lock.json`**
   (el CI usa `npm ci`).
2. `npm run lint`, `npm run test:unit`, `npm run build` → todo en verde.
3. `npx playwright install chromium` y `npm run test:e2e`.
4. Revisar `src/environments/*.ts`: URLs reales del API.
5. Si `use_firebase_auth`: completar el bloque `firebase` (apiKey, appId) de cada
   environment con la config web del proyecto; confirmar con backend que existen
   `POST /v1/auth/login|refresh|logout` con los contratos de `core/auth/auth.contracts.ts`
   (si no, issue al backend; no adaptar el front a un endpoint inventado).
6. Reemplazar los tokens de `src/styles/_tokens.scss` por los del sistema de diseño.
7. Crear la primera feature real copiando la estructura de `features/items` y
   **borrar `features/items`** (y su e2e) cuando ya no sirva de ejemplo.
8. Si `deploy_target = firebase-hosting`: seguir `docs/ci-cd-setup.md` (WIF por
   ambiente, variables `GCP_WIF_PROVIDER` y `GCP_SA_EMAIL`, tags `qa-v*` protegidos).
   Si `deploy_target = coolify`: seguir `docs/ci-cd-setup.md` (recursos *Docker Image*
   en Coolify, dominio + SSL, `docker login` al registry en el VPS, variables
   `COOLIFY_*` por environment, tags `qa-v*`/`prod-v*` protegidos) y probar la imagen
   con `docker compose up --build`.
9. Configurar el repo según `docs/02-repositorios-gitlab-github.md` (rama protegida,
   pipeline obligatorio, aprobaciones).
10. Ajustar `CLAUDE.md` con lo propio de la app (sin pasar de ~120 líneas).

## Mantener la plantilla

- Archivos con Jinja terminan en `.jinja`; el resto se copia tal cual.
- En `.html.jinja` y workflows de GitHub, todo `{{ }}` de Angular / `${{ }}` de
  Actions va dentro de `{% raw %}…{% endraw %}`.
- Archivos/carpetas condicionales: nombre `{% if <var> %}nombre{% endif %}`; para que
  las rutas no superen el límite de Windows se usan las variables computadas cortas
  `deploy_fb`, `deploy_cy`, `ci_gitlab`, `ci_github` (definidas al final de `copier.yml`).
- Antes de mergear un cambio, generar las combinaciones (auth/i18n/CI/deploy)
  y correr `npm run lint && npm run test:unit && npm run build` en cada una. Si se
  toca `Dockerfile`/`Caddyfile`: `docker build` + `docker run` y revisar con `curl -I`
  `/`, una ruta profunda (fallback SPA) y un asset con hash (cache).
- Versiones de dependencias: alineadas con la app de referencia (Angular `^21.2.0`,
  vitest `^4.0.8`, Playwright `^1.59.1`, ngx-translate `^17.0.0`, firebase `^12.9.0`,
  TypeScript `~5.9.2`). Subirlas en la plantilla y propagar con `copier update`.
