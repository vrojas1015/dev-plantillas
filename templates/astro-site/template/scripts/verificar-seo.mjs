#!/usr/bin/env node
// Test de SEO sobre el build (docs/seo.md). Falla —diciendo página y campo— si:
//   - falta <title>, description, canonical, og:* o twitter:card;
//   - el título pasa de 60 caracteres o la description no está entre 70 y 160;
//   - no hay exactamente un <h1>, o falta <html lang>;
//   - un título o una description se repiten entre páginas del mismo idioma;
//   - prod tiene una página con noindex, o QA/dev una página SIN noindex;
//   - el hreflang está incompleto (sin x-default o sin el idioma propio).
//
// Uso: npm run test:seo   (después de npm run build)
// El ambiente esperado sale de PUBLIC_ENTORNO; si no está definido, de robots.txt.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { sitio } from '../sitio.config.mjs'
import {
  carpetaPublica,
  esRedireccion,
  etiquetas,
  meta,
  paginasConSsr,
  titulo,
} from './lib/dist.mjs'

const carpeta = carpetaPublica()
const errores = []
const fallar = (pagina, campo, detalle) =>
  errores.push({ ruta: pagina.ruta, archivo: pagina.archivo, campo, detalle })

// --- Ambiente -------------------------------------------------------------------
const robotsTxt = existsSync(join(carpeta, 'robots.txt'))
  ? readFileSync(join(carpeta, 'robots.txt'), 'utf8')
  : ''
const robotsCerrado = /^Disallow:\s*\/\s*$/m.test(robotsTxt)
const entorno = process.env.PUBLIC_ENTORNO || (robotsCerrado ? 'qa' : 'prod')
const esProd = entorno === 'prod'
if (!robotsTxt)
  errores.push({ ruta: '/robots.txt', archivo: '-', campo: 'robots.txt', detalle: 'no existe' })
else if (esProd === robotsCerrado)
  errores.push({
    ruta: '/robots.txt',
    archivo: join(carpeta, 'robots.txt'),
    campo: 'robots.txt',
    detalle: esProd
      ? 'en prod no puede tener "Disallow: /"'
      : `en ${entorno} tiene que tener "Disallow: /"`,
  })

// --- Página por página ----------------------------------------------------------
const todas = (await paginasConSsr(carpeta)).filter((p) => !esRedireccion(p.html))
const es404 = (p) => p.ruta === '/404/' || p.ruta === '/404.html/'
const vistos = { title: new Map(), description: new Map() }

for (const p of todas) {
  const { html } = p
  const t = titulo(html)
  const d = meta(html, 'description')

  if (!t) fallar(p, 'title', 'falta')
  else if (t.length > 60) fallar(p, 'title', `tiene ${t.length} caracteres (máximo 60): "${t}"`)

  if (!d) fallar(p, 'description', 'falta')
  else if (d.length < 70 || d.length > 160)
    fallar(p, 'description', `tiene ${d.length} caracteres (70–160)`)

  const canonicas = etiquetas(html, 'link').filter((l) => l.rel === 'canonical')
  if (canonicas.length !== 1) fallar(p, 'canonical', canonicas.length ? 'hay más de una' : 'falta')
  else {
    const href = canonicas[0].href ?? ''
    if (!href.startsWith(sitio.url + '/'))
      fallar(p, 'canonical', `no es absoluta sobre ${sitio.url}: ${href}`)
    else if (href.includes('?') || href.includes('#'))
      fallar(p, 'canonical', `tiene parámetros: ${href}`)
    else if (!href.endsWith('/'))
      fallar(p, 'canonical', `sin barra final (política del sitio): ${href}`)
  }

  for (const campo of ['og:title', 'og:description', 'og:image', 'og:type', 'twitter:card']) {
    if (!meta(html, campo)) fallar(p, campo, 'falta')
  }
  const ogImage = meta(html, 'og:image')
  if (ogImage && !/^https?:\/\//.test(ogImage)) fallar(p, 'og:image', `no es absoluta: ${ogImage}`)

  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length
  if (h1 !== 1) fallar(p, 'h1', h1 ? `hay ${h1} (tiene que haber uno)` : 'falta')

  const lang = /<html[^>]*\slang="([^"]+)"/i.exec(html)?.[1]
  if (!lang) fallar(p, 'html lang', 'falta')

  const robots = meta(html, 'robots') ?? ''
  const noindex = robots.includes('noindex')
  if (esProd && noindex && !es404(p)) fallar(p, 'robots', 'noindex en prod')
  if (!esProd && !noindex) fallar(p, 'robots', `falta noindex en ${entorno}`)

  const alternos = etiquetas(html, 'link').filter((l) => l.rel === 'alternate' && l.hreflang)
  if (alternos.length > 0) {
    if (!alternos.some((a) => a.hreflang === 'x-default')) fallar(p, 'hreflang', 'falta x-default')
    if (lang && !alternos.some((a) => a.hreflang === lang))
      fallar(p, 'hreflang', `falta el idioma propio (${lang})`)
    for (const a of alternos)
      if (!a.href?.startsWith(sitio.url + '/')) fallar(p, 'hreflang', `href no absoluta: ${a.href}`)
  }

  // Duplicados por idioma: /blog/ y /en/blog/ pueden llamarse igual (son la misma
  // página traducida y están enlazadas con hreflang).
  if (!es404(p)) {
    for (const [campo, valor] of [
      ['title', t],
      ['description', d],
    ]) {
      if (!valor) continue
      const clave = `${lang}\u0000${valor}`
      ;(vistos[campo].get(clave) ?? vistos[campo].set(clave, []).get(clave)).push(p)
    }
  }
}

for (const [campo, mapa] of Object.entries(vistos)) {
  for (const [clave, ps] of mapa) {
    const valor = clave.split('\u0000')[1]
    if (ps.length > 1) {
      for (const p of ps)
        fallar(
          p,
          campo,
          `duplicado en ${ps.length} páginas (${ps.map((x) => x.ruta).join(', ')}): "${valor}"`,
        )
    }
  }
}

// --- Resultado ------------------------------------------------------------------
if (errores.length) {
  console.error(`✗ Test de SEO: ${errores.length} error(es) en ${carpeta}/ (ambiente ${entorno})\n`)
  for (const e of errores)
    console.error(`  ✗ ${e.ruta}  [${e.campo}] ${e.detalle}\n      ${e.archivo}`)
  process.exit(1)
}
console.log(`✓ Test de SEO: ${todas.length} páginas OK en ${carpeta}/ (ambiente ${entorno})`)
