#!/usr/bin/env node
// Ninguna URL publicada desaparece sin redirección 301 (docs/seo.md).
// Compara las rutas del sitemap de PRODUCCIÓN (lo que Google ya conoce) contra
// las del sitemap del build actual: cada ruta que ya no existe tiene que estar
// en redirects.json.
//
//   SITEMAP_PROD=https://www.ejemplo.com/sitemap-index.xml npm run test:redirecciones
//   SITEMAP_PROD=./sitemap-prod.xml npm run test:redirecciones   (archivo local)
//
// Sin SITEMAP_PROD (o si el sitio todavía no está publicado) no hace nada: es
// opcional hasta el primer deploy a producción.
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { carpetaPublica } from './lib/dist.mjs'

const origen = process.env.SITEMAP_PROD
if (!origen) {
  console.log('· Redirecciones: SITEMAP_PROD no está definida; se omite el chequeo.')
  process.exit(0)
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])

const esUrl = (s) => /^https?:\/\//.test(s)

/** Rutas de un sitemap (o de un sitemap-index, recursivamente), por URL o archivo. */
async function rutas(ubicacion) {
  let xml
  if (esUrl(ubicacion)) {
    const res = await fetch(ubicacion)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${ubicacion} respondió ${res.status}`)
    xml = await res.text()
  } else {
    if (!existsSync(ubicacion)) return null
    xml = readFileSync(ubicacion, 'utf8')
  }
  const salida = new Set()
  for (const loc of locs(xml)) {
    if (!xml.includes('<sitemapindex')) {
      salida.add(new URL(loc).pathname)
      continue
    }
    // Sitemap hijo: por URL, o en la misma carpeta si el índice es un archivo local.
    const hijo = esUrl(ubicacion) ? loc : join(dirname(ubicacion), basename(new URL(loc).pathname))
    for (const r of (await rutas(hijo)) ?? []) salida.add(r)
  }
  return salida
}

const anteriores = await rutas(esUrl(origen) ? origen : resolve(origen)).catch((e) => {
  console.error(`✗ No se pudo leer ${origen}: ${e.message}`)
  process.exit(1)
})
if (anteriores === null) {
  console.log(
    `· Redirecciones: ${origen} no existe todavía (¿primer deploy?); se omite el chequeo.`,
  )
  process.exit(0)
}

const carpeta = carpetaPublica()
const actuales = await rutas(join(carpeta, 'sitemap-index.xml'))
if (!actuales) {
  console.error(`✗ No hay ${carpeta}/sitemap-index.xml: corré npm run build.`)
  process.exit(1)
}
const redirecciones = JSON.parse(readFileSync('redirects.json', 'utf8'))
const conRedireccion = new Set(Object.keys(redirecciones).flatMap((r) => [r, r.replace(/\/$/, '')]))

const faltan = [...anteriores].filter((r) => !actuales.has(r) && !conRedireccion.has(r))
if (faltan.length) {
  console.error(`✗ ${faltan.length} ruta(s) publicadas desaparecen sin redirección 301.`)
  console.error('  Agregalas a redirects.json con su destino nuevo:\n')
  for (const r of faltan) console.error(`  ✗ ${r}`)
  process.exit(1)
}
console.log(`✓ Redirecciones: las ${anteriores.size} rutas de ${origen} existen o redirigen.`)
