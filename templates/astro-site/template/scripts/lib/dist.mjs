// Utilidades para leer el build (dist/) sin dependencias: recorrer las páginas
// HTML y extraer etiquetas con expresiones regulares. Alcanza porque el HTML lo
// genera Astro (predecible); no es un parser de HTML general.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Carpeta con los archivos públicos: dist/ (estático) o dist/client/ (híbrido). */
export function carpetaPublica(raiz = 'dist') {
  const cliente = `${raiz}/client`
  if (existsSync(cliente) && existsSync(`${raiz}/server`)) return cliente
  if (!existsSync(raiz)) {
    console.error(`No existe ${raiz}/: corré primero npm run build.`)
    process.exit(2)
  }
  return raiz
}

/** Todas las páginas HTML: [{ archivo, ruta, html }]. ruta = URL sin dominio. */
export function paginas(carpeta) {
  const salida = []
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const completo = join(dir, nombre)
      if (statSync(completo).isDirectory()) recorrer(completo)
      else if (nombre.endsWith('.html')) {
        const rel = relative(carpeta, completo).split(sep).join('/')
        const ruta = '/' + rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '/')
        salida.push({ archivo: completo, ruta, html: readFileSync(completo, 'utf8') })
      }
    }
  }
  recorrer(carpeta)
  return salida.sort((a, b) => a.ruta.localeCompare(b.ruta))
}

/**
 * Páginas SSR (render híbrido): no están en dist/, así que se piden a un server
 * levantado (SEO_SERVIDOR=http://localhost:4321) a partir del sitemap del build.
 * Sin SEO_SERVIDOR devuelve sólo las páginas de dist/.
 */
export async function paginasConSsr(carpeta) {
  const estaticas = paginas(carpeta)
  const servidor = process.env.SEO_SERVIDOR
  if (!servidor) return estaticas
  const conocidas = new Set(estaticas.map((p) => p.ruta))
  const leer = (archivo) => readFileSync(join(carpeta, archivo), 'utf8')
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  const rutas = locs(leer('sitemap-index.xml')).flatMap((hijo) => locs(leer(hijo.slice(1))))
  for (const ruta of rutas.filter((r) => !conocidas.has(r))) {
    const res = await fetch(new URL(ruta, servidor))
    if (!res.ok) throw new Error(`${servidor}${ruta} respondió ${res.status}`)
    estaticas.push({ archivo: `${servidor}${ruta} (SSR)`, ruta, html: await res.text() })
  }
  return estaticas
}

const entidades = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&lt;': '<',
  '&gt;': '>',
}
export const decodificar = (s) => s.replace(/&(amp|quot|#39|#x27|lt|gt);/g, (m) => entidades[m])

/** Atributos de una etiqueta: '<meta name="a" content="b">' → { name: 'a', content: 'b' }. */
function atributos(etiqueta) {
  const attrs = {}
  for (const m of etiqueta.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodificar(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Todas las etiquetas <nombre ...> del head/body, como objetos de atributos. */
export function etiquetas(html, nombre) {
  return [...html.matchAll(new RegExp(`<${nombre}\\b([^>]*)>`, 'gi'))].map((m) => atributos(m[1]))
}

export function meta(html, clave) {
  const m = etiquetas(html, 'meta').find((a) => a.name === clave || a.property === clave)
  return m?.content
}

export function titulo(html) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodificar(m[1].trim()) : undefined
}

export const esRedireccion = (html) => /<meta\s+http-equiv="refresh"/i.test(html)

/** Bloques <script type="application/ld+json">: texto crudo. */
export function bloquesJsonLd(html) {
  return [
    ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1])
}
