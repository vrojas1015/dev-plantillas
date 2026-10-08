# Plantilla: app frontend Angular

Plantilla [Copier](https://copier.readthedocs.io/) para apps frontend del equipo:
Angular 21 standalone + signals, SCSS/BEM, cliente API tipado, Firebase Auth + JWT
propio (opcional), @ngx-translate (opcional), vitest + Playwright, y CI/CD en
GitLab o GitHub con deploy keyless a Firebase Hosting (opcional).

Está extraída del patrón de la app de admin existente, sin nombres ni IDs reales.

## Qué genera

```
<app>/
├── CLAUDE.md                     contexto corto para agentes (stack, estructura, reglas)
├── .claude/settings.json         permisos allow/deny para Claude Code
├── .gitlab-ci.yml | .github/     CI: MR/PR → lint + unit + build; main → prod; tag qa-v* → QA
├── docs/ci-cd-setup.md           setup de una vez (WIF en GCP + variables del CI)
├── docs/estilos-bem.md           convención SCSS + BEM
├── firebase.json, .firebaserc    (si deploy_target = firebase-hosting)
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
| `use_firebase_auth` | `true` | login Firebase → JWT propio (access en memoria, refresh en localStorage) + interceptor + guard |
| `deploy_target` | `firebase-hosting` | `firebase-hosting` o `ninguno` (CI sólo verifica) |
| `firebase_project_qa` / `_prod` | `<app_name>-qa` / `-prod` | IDs de proyecto GCP/Firebase (sólo si auth o deploy a Firebase) |
| `ci_provider` | `gitlab` | `gitlab` o `github` |
| `i18n` | `true` | textos vía @ngx-translate |
| `default_lang` | `es` | `<html lang>`, idioma de i18n y locale de Playwright |

No se pregunta ni se genera ningún secreto, número de proyecto, audience de WIF ni
email de service account: son variables del CI documentadas en `docs/ci-cd-setup.md`.

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
9. Configurar el repo según `docs/02-repositorios-gitlab-github.md` (rama protegida,
   pipeline obligatorio, aprobaciones).
10. Ajustar `CLAUDE.md` con lo propio de la app (sin pasar de ~120 líneas).

## Mantener la plantilla

- Archivos con Jinja terminan en `.jinja`; el resto se copia tal cual.
- En `.html.jinja` y workflows de GitHub, todo `{{ }}` de Angular / `${{ }}` de
  Actions va dentro de `{% raw %}…{% endraw %}`.
- Archivos/carpetas condicionales: nombre `{% if <var> %}nombre{% endif %}`; para que
  las rutas no superen el límite de Windows se usan las variables computadas cortas
  `deploy_fb`, `ci_gitlab`, `ci_github` (definidas al final de `copier.yml`).
- Antes de mergear un cambio, generar las cuatro combinaciones (auth/i18n/CI/deploy)
  y correr `npm run lint && npm run test:unit && npm run build` en cada una.
- Versiones de dependencias: alineadas con la app de referencia (Angular `^21.2.0`,
  vitest `^4.0.8`, Playwright `^1.59.1`, ngx-translate `^17.0.0`, firebase `^12.9.0`,
  TypeScript `~5.9.2`). Subirlas en la plantilla y propagar con `copier update`.
