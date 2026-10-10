#!/usr/bin/env node
// Validación del JSON-LD del build. Los TIPOS ya los controla schema-dts al
// compilar; acá se controla lo que llega al HTML:
//   - cada bloque <script type="application/ld+json"> es JSON válido, con
//     @context https://schema.org y @type en cada nodo;
//   - cada tipo trae sus propiedades mínimas (REQUERIDAS);
//   - las páginas clave tienen el tipo esperado (ESPERADOS).
//
// Uso: npm run test:jsonld   (después de npm run build). --detalle lista los tipos por página.
import { sitio } from '../sitio.config.mjs'
import { bloquesJsonLd, carpetaPublica, esRedireccion, paginasConSsr } from './lib/dist.mjs'

/** Propiedades mínimas por tipo (ampliar al agregar tipos). */
const REQUERIDAS = {
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  SearchAction: ['target', 'query-input'],
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position', 'name', 'item'],
  BlogPosting: ['headline', 'datePublished', 'url'],
  Article: ['headline', 'datePublished'],
  Product: ['name', 'offers'],
  Offer: ['price', 'priceCurrency'],
  FAQPage: ['mainEntity'],
}

/** Tipos que tiene que tener cada página según su ruta (idioma opcional al principio). */
const idioma = `(?:/(?:${sitio.idiomas.join('|')}))?`
const ESPERADOS = [
  { patron: new RegExp(`^${idioma}/$`), tipos: ['Organization', 'WebSite'] },
  { patron: new RegExp(`^${idioma}/blog/[^/]+/$`), tipos: ['BlogPosting', 'BreadcrumbList'] },
  { patron: new RegExp(`^${idioma}/catalogo/[^/]+/$`), tipos: ['Product', 'BreadcrumbList'] },
]

const carpeta = carpetaPublica()
const errores = []
const detalle = process.argv.includes('--detalle')
let bloques = 0

/** Recorre el árbol del JSON-LD y devuelve los nodos con @type. */
function nodos(valor, salida = []) {
  if (Array.isArray(valor)) valor.forEach((v) => nodos(v, salida))
  else if (valor && typeof valor === 'object') {
    if (valor['@type']) salida.push(valor)
    for (const [k, v] of Object.entries(valor)) if (k !== '@context') nodos(v, salida)
  }
  return salida
}

for (const p of (await paginasConSsr(carpeta)).filter((p) => !esRedireccion(p.html))) {
  const tipos = new Set()
  for (const [i, crudo] of bloquesJsonLd(p.html).entries()) {
    bloques++
    let datos
    try {
      datos = JSON.parse(crudo)
    } catch (e) {
      errores.push(`${p.ruta}: bloque ${i + 1} no es JSON válido (${e.message})`)
      continue
    }
    if (datos['@context'] !== 'https://schema.org')
      errores.push(`${p.ruta}: bloque ${i + 1} sin "@context": "https://schema.org"`)
    const raiz = datos['@graph'] ?? [datos]
    for (const nodo of raiz)
      if (!nodo['@type']) errores.push(`${p.ruta}: nodo sin @type en el bloque ${i + 1}`)
    for (const nodo of nodos(datos)) {
      const tipo = String(nodo['@type'])
      tipos.add(tipo)
      for (const prop of REQUERIDAS[tipo] ?? []) {
        if (nodo[prop] === undefined || nodo[prop] === '')
          errores.push(`${p.ruta}: ${tipo} sin "${prop}"`)
      }
    }
  }
  for (const { patron, tipos: esperados } of ESPERADOS) {
    if (!patron.test(p.ruta)) continue
    for (const tipo of esperados)
      if (!tipos.has(tipo)) errores.push(`${p.ruta}: falta el tipo ${tipo}`)
  }
  if (detalle && tipos.size) console.log(`  ${p.ruta}  →  ${[...tipos].join(', ')}`)
}

if (errores.length) {
  console.error(`✗ JSON-LD: ${errores.length} error(es)\n`)
  for (const e of errores) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`✓ JSON-LD: ${bloques} bloques válidos en ${carpeta}/`)
