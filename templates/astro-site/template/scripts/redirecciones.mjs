#!/usr/bin/env node
// Exporta redirects.json (la ÚNICA fuente de redirecciones) al formato del hosting:
//
//   node scripts/redirecciones.mjs caddy      → stdout: bloque para el Caddyfile (301)
//   node scripts/redirecciones.mjs firebase   → escribe hosting.redirects en firebase.json (301)
//
// Astro, además, las aplica en dev y (en modo híbrido) en el server de Node, y en
// el build estático deja una página con meta refresh como red de seguridad.
import { readFileSync, writeFileSync } from 'node:fs'

const redirecciones = JSON.parse(readFileSync('redirects.json', 'utf8'))
const destino = (v) => (typeof v === 'string' ? v : v.destination)
const formato = process.argv[2]

if (formato === 'caddy') {
  const lineas = ['# Generado desde redirects.json por scripts/redirecciones.mjs: no editar.']
  for (const [desde, hacia] of Object.entries(redirecciones)) {
    const sinBarra = desde.replace(/\/$/, '')
    // La regla cubre la ruta con y sin barra final.
    lineas.push(`redir ${sinBarra} ${destino(hacia)} permanent`)
    if (sinBarra !== desde) lineas.push(`redir ${desde} ${destino(hacia)} permanent`)
  }
  console.log(lineas.join('\n'))
} else if (formato === 'firebase') {
  const config = JSON.parse(readFileSync('firebase.json', 'utf8'))
  config.hosting.redirects = Object.entries(redirecciones).map(([desde, hacia]) => ({
    source: desde.replace(/\/$/, '') + '{,/}',
    destination: destino(hacia),
    type: 301,
  }))
  writeFileSync('firebase.json', JSON.stringify(config, null, 2) + '\n')
  console.log(`firebase.json: ${config.hosting.redirects.length} redirecciones 301`)
} else {
  console.error('Uso: node scripts/redirecciones.mjs caddy|firebase')
  process.exit(2)
}
