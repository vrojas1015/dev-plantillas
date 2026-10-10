# Frontend y SEO

Cómo elegir la plantilla de front según el proyecto, y especificación de la
plantilla `astro-site` (construida), orientada a sitios públicos
que tienen que posicionar en buscadores.

## 1. Qué plantilla usar

| Proyecto | Plantilla | Por qué |
|---|---|---|
| Panel de administración, app interna, mucho login y formularios | `angular-app` (existe) | Estructura fuerte para apps grandes y equipos; el SEO no importa |
| **Sitio público:** landing, blog, marketing, catálogo, perfiles públicos, docs de producto | **`astro-site`** (esta spec) | HTML generado en el build: carga casi instantánea y los buscadores lo indexan completo. La interactividad va en *islas* de React |
| App interactiva sin SEO, en un equipo o cliente que trabaja con React | `react-app` (pendiente) | Vite + React + TypeScript; el equivalente React de `angular-app` |
| App con SEO **y** mucha lógica de servidor por usuario | Next.js (sin plantilla) | Sólo si aparece el caso: Astro con islas de React y rutas SSR cubre la mayoría |

**Regla práctica:** si una página tiene que aparecer en Google, va en
`astro-site`. Si sólo la usa gente logueada, va en la app.

Una misma plataforma suele tener las dos: el sitio público en Astro (con un
buscador o un perfil público como isla de React) y el panel en Angular, ambos
contra el mismo `api-gateway`.

## 2. `astro-site`: arquitectura

```
astro-site/
├── astro.config.mjs            ← site, i18n, integraciones, adapter (si hay SSR)
├── src/
│   ├── layouts/Base.astro      ← <html lang>, <Seo>, analítica, skip-link
│   ├── components/
│   │   ├── seo/Seo.astro       ← title, description, canonical, OG, Twitter, hreflang, robots
│   │   ├── seo/JsonLd.astro    ← datos estructurados tipados
│   │   └── islands/            ← componentes React interactivos (client:visible / client:idle)
│   ├── content/                ← colecciones (blog, páginas) en Markdown/MDX con esquema
│   ├── content.config.ts       ← esquemas zod de las colecciones
│   ├── pages/                  ← rutas; [slug].astro para contenido y entidades
│   ├── lib/
│   │   ├── api/                ← cliente tipado del api-gateway (desde protos/OpenAPI)
│   │   └── seo.ts              ← helpers: títulos, canónicas, breadcrumbs, JSON-LD
│   └── styles/
├── public/                     ← favicon, imágenes que no se procesan
├── lighthouserc.json           ← presupuestos de Lighthouse CI
└── redirects.json              ← redirecciones 301 (o en astro.config)
```

- **Estático por defecto (SSG).** Todo lo que se pueda generar en el build se
  genera en el build.
- **SSR sólo donde haga falta**, por ruta (`export const prerender = false`),
  con el adapter de Node para Cloud Run o Coolify.
- **Cero JavaScript por defecto.** Cada isla de React declara cuándo se hidrata
  (`client:visible`, `client:idle`); `client:load` necesita justificación.

## 3. SEO técnico (lo que trae listo)

### Metadatos

`<Seo>` es **obligatorio** en el layout y recibe props tipadas. Un test falla
si una página no lo usa o si le falta algo.

| Elemento | Regla |
|---|---|
| `<title>` | Único por página, ≤ 60 caracteres, formato `Página · Sitio` |
| `description` | Única, 70–160 caracteres |
| `canonical` | Absoluta, siempre presente; sin parámetros de tracking |
| Open Graph / Twitter | `og:title`, `og:description`, `og:image` (1200×630), `og:type`, `twitter:card` |
| `robots` | `index,follow` en prod; **`noindex,nofollow` en todo lo que no sea prod** (QA, previews) |
| `hreflang` | Una entrada por idioma más `x-default`, si hay más de un idioma |
| `<html lang>` | Según el idioma de la página |

### Datos estructurados (JSON-LD)

`<JsonLd>` con tipos de `schema-dts`, para que un JSON-LD mal formado no compile:

| Tipo | Dónde |
|---|---|
| `Organization` + `WebSite` (con `SearchAction` si hay buscador) | Home |
| `BreadcrumbList` | Toda página con jerarquía |
| `Article` / `BlogPosting` | Entradas del blog |
| `FAQPage` | Páginas con preguntas frecuentes |
| Tipo de la entidad (`School`, `Product`, `LocalBusiness`, `Event`...) | Páginas de entidades (§4) |

### Indexación

- `sitemap.xml` generado (`@astrojs/sitemap`), incluidas las páginas de entidades
  y las de cada idioma, con `lastmod` real.
- `robots.txt` generado por ambiente: en QA, `Disallow: /`.
- Redirecciones **301** declaradas en un solo lugar; el CI falla si una ruta
  borrada no tiene redirección (comparando con el sitemap de prod publicado).
- Página **404** propia que devuelve status 404 (no 200).
- URLs en minúsculas, `kebab-case`, sin barra final inconsistente (una política
  y redirección de la otra).
- RSS para el blog.

### Rendimiento (Core Web Vitals)

| Métrica | Objetivo | Cómo |
|---|---|---|
| LCP | < 2,5 s | Imagen principal con `astro:assets` (AVIF/WebP, `sizes`, `fetchpriority="high"`), sin JS bloqueante |
| CLS | < 0,1 | `width`/`height` en toda imagen, fuentes locales con `font-display: swap` y métricas de fallback |
| INP | < 200 ms | Pocas islas, hidratadas tarde; nada de librerías pesadas en la primera carga |

- Fuentes servidas desde el propio sitio, no desde Google Fonts.
- Presupuesto de JS por página (p. ej. ≤ 50 KB comprimidos fuera de las islas).

### Accesibilidad

Cuenta para SEO y es obligatoria: HTML semántico, un solo `<h1>`, jerarquía de
encabezados, `alt` en imágenes, contraste AA, foco visible, skip-link.

## 4. Páginas de entidades desde la API (SEO programático)

El caso más común en una plataforma: una página pública por cada entidad del
backend (perfil de escuela, producto, evento). Hay tres estrategias:

| Estrategia | Cómo | Cuándo |
|---|---|---|
| **SSG en el build** | `getStaticPaths` pide la lista al gateway en el build; un webhook dispara un rebuild cuando cambian los datos | Hasta unos miles de entidades que cambian pocas veces al día |
| **SSR con caché del CDN** | Ruta con `prerender = false`; respuesta con `Cache-Control: s-maxage=…, stale-while-revalidate=…` | Muchas entidades o datos que cambian seguido |
| Híbrido | Las más visitadas en el build, el resto en SSR | Catálogos grandes |

La plantilla trae la ruta de ejemplo `pages/[entidad]/[slug].astro` con SSG y
la opción SSR documentada. Reglas para las páginas de entidades:

- El **slug** es estable y legible (`/escuelas/eton-college`), no un id. Si
  cambia, el viejo redirige con 301.
- Contenido único por página (no plantillas vacías con el nombre cambiado: Google
  las trata como contenido escaso).
- Entidad inexistente → **404 real**; entidad retirada → 410 o 301 a la más
  parecida.
- El sitemap de entidades se genera desde la misma lista.

### Islas interactivas (buscadores, filtros)

Patrones para que una isla de React no rompa el SEO ni la experiencia:

- **Estado en la URL** (`?q=…&pais=…`): links compartibles, back/forward
  funcionan, y los buscadores ven URLs con sentido. Las combinaciones de filtros
  llevan `canonical` a la página base (o `noindex`) para no generar miles de URLs
  duplicadas.
- Caché entre navegaciones y restauración de scroll al volver.
- Protección contra respuestas viejas que pisan a las nuevas.
- Los resultados iniciales se renderizan en el HTML (SSG/SSR); la isla sólo
  toma el control después.

## 5. Contenido

- **Colecciones** con esquema zod: un post sin `title`, `description` o
  `publishDate` no compila.
- Markdown/MDX en el repo como fuente por defecto: versionado y revisable en PR.
- Un CMS headless queda **fuera de alcance**; la colección está aislada en
  `src/content/` para poder reemplazar la fuente después.
- Imágenes del contenido junto al Markdown, procesadas por `astro:assets`.

## 6. Analítica y consentimiento

- Pregunta `analytics`: `ga4` | `plausible` | `ninguna`.
- GA4 con **Consent Mode v2** y un banner propio liviano: no se cargan cookies
  de analítica hasta aceptar. Plausible no usa cookies.
- Search Console: guía para verificar el dominio y enviar el sitemap.
- Nada de scripts de terceros sin `defer`/`async` ni fuera del presupuesto.

## 7. Calidad en el CI

| Paso | Herramienta | Falla si |
|---|---|---|
| Tipos y build | `astro check` + `astro build` | Error de tipos, colección inválida, JSON-LD mal tipado |
| SEO por página | Test propio sobre `dist/` | Falta `title`, `description`, `canonical`, `og:image` o `<h1>`; títulos o descripciones duplicados; `noindex` en prod |
| Lighthouse | **Lighthouse CI** sobre las páginas clave (home, un post, una entidad) | SEO < 100, accesibilidad < 95, buenas prácticas < 95, rendimiento < 90 (móvil) |
| Enlaces | `lychee` sobre `dist/` | Enlace interno roto (externos sólo en la rama principal) |
| JSON-LD | Validación del JSON y de los tipos | JSON inválido |
| Redirecciones | Comparar rutas contra el sitemap de prod | Ruta eliminada sin 301 |
| Formato | prettier + eslint | — |

Lighthouse en el CI es el control más importante: impide que el SEO o el
rendimiento se degraden sin que nadie lo note.

## 8. Deploy

Mismo `deploy_target` que el resto de las plantillas:

| Destino | Modo |
|---|---|
| `firebase-hosting` | Estático. Con SSR, las rutas dinámicas van a Cloud Run detrás de Hosting (rewrites) |
| `coolify` | Estático con Caddy; con SSR, el adapter de Node en el mismo contenedor |
| `cloud-run` | Sólo si hay SSR |
| `ninguno` | — |

QA siempre con `noindex` y `robots.txt` cerrado, y con basic auth opcional.

## 9. Plantilla: preguntas

```
site_name:        "Mi sitio"
site_url:         https://www.ejemplo.com       # base de canonical y sitemap
idiomas:          [es]                          # más de uno activa i18n + hreflang
blog:             true | false
entidades_api:    true | false                  # ruta de ejemplo de páginas de entidades
api_base_url:     https://api.ejemplo.com       # si entidades_api
render:           estatico | hibrido            # hibrido agrega el adapter de Node
analytics:        ga4 | plausible | ninguna
deploy_target:    firebase-hosting | coolify | cloud-run | ninguno
ci_provider:      gitlab | github
```

Versiones: Astro y React en la última mayor estable al construir la plantilla
(hoy el sitio de referencia usa Astro 6 + React 19); fijadas y verificadas.

## 10. Criterios de terminado

- [ ] `copier copy` con cada combinación relevante → `astro check`,
      `astro build` y el test de SEO pasan.
- [ ] Una página sin `description` o con un título duplicado → el test de SEO
      falla diciendo qué página y qué campo.
- [ ] Lighthouse CI sobre el build: SEO 100, accesibilidad ≥ 95, rendimiento
      ≥ 90 en móvil; bajar un umbral a propósito (una imagen enorme sin
      optimizar) → falla.
- [ ] `sitemap.xml` incluye posts, entidades e idiomas con `hreflang`;
      `robots.txt` de QA bloquea todo; las páginas de QA llevan `noindex`.
- [ ] El JSON-LD de home, post y entidad es JSON válido y del tipo esperado.
- [ ] Ruta de entidad inexistente → 404 real (también en SSR).
- [ ] Una isla de buscador con estado en la URL: recargar mantiene los filtros;
      la página sin JS muestra los resultados iniciales.
- [ ] Con `analytics: ga4`, no se carga ninguna cookie antes de aceptar.
- [ ] Imagen Docker (coolify) sirve el sitio; con `hibrido`, una ruta SSR responde.
- [ ] `copier update` entre dos versiones sin conflictos.

## Referencias

- Astro: <https://docs.astro.build>
- Google Search Central: <https://developers.google.com/search/docs>
- Core Web Vitals: <https://web.dev/articles/vitals>
- Lighthouse CI: <https://github.com/GoogleChrome/lighthouse-ci>
- schema.org: <https://schema.org>
