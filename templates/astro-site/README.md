# Plantilla: sitio público Astro

Plantilla [Copier](https://copier.readthedocs.io/) para sitios que tienen que posicionar
en buscadores (landing, blog, catálogo, perfiles públicos): Astro 7 con SSG (o híbrido
con rutas SSR en Node), islas de React 19, SEO técnico obligatorio y verificado en el CI,
JSON-LD tipado, Lighthouse CI con presupuestos y deploy a Firebase Hosting, Coolify o
Cloud Run. Especificación: `docs/07-frontend-y-seo.md`.

## Qué genera

```
<sitio>/
├── CLAUDE.md, .claude/settings.json   reglas cortas para agentes + permisos
├── astro.config.mjs                    site, trailingSlash, i18n, sitemap (lastmod), redirects, astro:env
├── sitio.config.mjs                    nombre, URL, idiomas: única fuente para config, código y scripts
├── redirects.json                      redirecciones 301 (único lugar)
├── lighthouserc.json, lychee.toml      presupuestos de Lighthouse CI y enlaces
├── scripts/                            verificar-seo / verificar-jsonld / verificar-redirecciones / redirecciones (caddy|firebase)
├── servidor.mjs                        (híbrido) server de Node de Astro + compresión
├── Dockerfile, Caddyfile, compose      (coolify: Caddy; híbrido: Node) · cloudbuild + cloudrun.*.yaml (Cloud Run)
├── firebase.json, .firebaserc          (firebase-hosting; con híbrido, rewrites a Cloud Run)
├── .github/ | .gitlab-ci.yml           CI de calidad + deploy según destino, PR/MR template
├── docs/                               seo.md · deploy.md · search-console.md
└── src/
    ├── layouts/Base.astro              <html lang>, <Seo>, JSON-LD, skip-link (toda página)
    ├── components/seo/                 Seo.astro (title, description, canonical, OG, hreflang, robots) · JsonLd.astro (schema-dts)
    ├── components/islands/Buscador.tsx (entidades_api) estado en la URL, caché, scroll, sin respuestas viejas
    ├── components/Analitica.astro      (ga4: Consent Mode v2 + banner propio · plausible)
    ├── content.config.ts, content/blog/<idioma>/   (blog) colección con zod; RSS
    ├── lib/                            seo.ts, i18n.ts, blog.ts, api/ (contratos + cliente api|mock + fixture), sitemap-fechas.ts
    ├── pages/                          envoltorios finos: index, 404, robots.txt, blog/, catalogo/[slug], [lang]/…
    └── vistas/                         contenido de cada tipo de página (uno para todos los idiomas)
```

## Preguntas

| Pregunta | Default | Para qué |
|---|---|---|
| `site_name` | `Mi sitio` | sufijo de cada `<title>` (`Página · Sitio`); ≤ 30 caracteres |
| `repo_name` | `sitio-web` | kebab-case: repo, paquete npm, imagen, servicio de Cloud Run |
| `site_url` | `https://www.ejemplo.com` | base de canonical, OG y sitemap (https, sin barra final) |
| `idiomas` | `[es]` | el primero es el default; más de uno activa `[lang]/`, hreflang y el sitemap con alternates |
| `blog` | `true` | colección Markdown/MDX + RSS + `BlogPosting` |
| `entidades_api` | `true` | catálogo de ejemplo desde el api-gateway (SSG o SSR) + isla de buscador |
| `api_base_url` | `https://api.ejemplo.com` | (si `entidades_api`) gateway de producción; dev y CI usan un fixture |
| `render` | `estatico` | `hibrido` agrega `@astrojs/node` y hace SSR la página de entidad (requiere `entidades_api`) |
| `analytics` | `ninguna` | `ga4` (Consent Mode v2, nada se carga antes de aceptar) · `plausible` |
| `deploy_target` | `firebase-hosting` | `coolify` · `cloud-run` (sólo con `hibrido`, validado) · `ninguno` |
| `gcp_project_qa` / `_prod`, `gcp_region` | derivados | sólo Firebase / Cloud Run |
| `ci_provider` | `gitlab` | `gitlab` · `github` |

No se pregunta ningún secreto ni ID de medición: `PUBLIC_GA4_ID`, WIF, tokens de Coolify
y `SITEMAP_PROD` son variables del CI (ver `docs/deploy.md` del proyecto generado).

## Generar

```powershell
python -m copier copy --defaults `
  -d site_name="Mi sitio" -d site_url=https://www.ejemplo.com -d "idiomas=[es]" `
  -d blog=true -d entidades_api=false -d render=estatico -d analytics=plausible `
  -d deploy_target=coolify -d ci_provider=github `
  C:\dev\<org>\plantillas\templates\astro-site C:\dev\<org>\frontend\<sitio>
cd C:\dev\<org>\frontend\<sitio>; npm install; Copy-Item .env.example .env; npm run dev
```

`copier update` necesita la plantilla en un repo git propio con tags (igual que el resto:
`scripts/publish-template.sh`).

## Versiones (fijadas, verificadas con `npm view` en octubre de 2026)

astro 7.3.8 · @astrojs/react 7.0.1 · @astrojs/mdx 8.0.3 · @astrojs/sitemap 3.7.4 ·
@astrojs/rss 4.0.19 · @astrojs/node 11.1.7 · @astrojs/check 0.9.10 · react / react-dom /
@types/react 19.3.0 · schema-dts 2.1.0 · @lhci/cli 0.15.1 · typescript **6.0.3** (la 7.0 no
la soportan todavía `@astrojs/check` ni `typescript-eslint`) · eslint 10.12.0 ·
typescript-eslint 8.71.1 · eslint-plugin-astro 3.2.1 · eslint-plugin-react-hooks 7.1.1 ·
prettier 3.9.9 · prettier-plugin-astro 1.1.1 · compression 1.8.2 (híbrido) · lychee 0.24.2 (imagen).

### Diferencias con la spec por Astro 6/7

- Colecciones: Content Layer obligatorio (`src/content.config.ts` + `glob()` de
  `astro/loaders`), `z` desde `astro/zod` (Zod 4), `render(entry)` y `entry.id` (no `slug`).
- `output: 'hybrid'` ya no existe: `output` estático + adapter + `prerender = false` por ruta.
- Astro 7: compilador en Rust (HTML inválido no se corrige), Markdown con Sätteri por
  defecto, `compressHTML: 'jsx'` (el formato de prettier-plugin-astro 1.x ya no usa llaves
  sueltas), Vite 8. `cache`/`routeRules` son estables (la plantilla pone `Cache-Control` a
  mano para no depender del adapter).
- `astro:env` (variables tipadas) reemplaza leer `import.meta.env` a mano.
- Con el adapter de Node, `Astro.rewrite('/404/')` a una 404 prerenderizada falla en SSR:
  la ruta SSR pone `Astro.response.status = 404` y renderiza la vista 404.
- `@astrojs/sitemap` `serialize` corre cuando Vite ya no carga módulos: el `lastmod` se
  calcula al cargar la config (top-level await).
- El server standalone del adapter no comprime: `servidor.mjs` lo envuelve con `compression`.

## Mantener la plantilla

- Archivos con Jinja terminan en `.jinja`; en workflows de GitHub `${{ }}` va en `{% raw %}`.
  En `.astro`/`.tsx` evitar `{{` y `{#` (chocan con Jinja).
- Condicionales con variables cortas (`ent`, `hib`, `ana`, `ga4`, `d_fb`, `d_cy`, `d_cr`,
  `caddy`, `docker`, `has_cd`, `ci_gl`, `ci_gh`; al final de `copier.yml`).
- Antes de mergear: generar las combinaciones del job `astro-site` de
  `.github/workflows/templates.yml` y correr `npm run verificar` + `npx lhci autorun` en
  cada una; si se toca Docker, `docker build` + `curl` (200, 404 real, 301).
- Formato: el CI corre `prettier --check`; un cambio de formato en un `.astro.jinja` se
  verifica generando y corriendo `npm run lint`.
