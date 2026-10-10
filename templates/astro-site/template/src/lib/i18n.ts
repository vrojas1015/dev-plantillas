// Idiomas y rutas localizadas. El idioma default va sin prefijo (/blog/),
// el resto con prefijo (/en/blog/). Los segmentos de ruta NO se traducen:
// así una página tiene la misma ruta en todos los idiomas y el sitemap y el
// hreflang se arman solos.
import { sitio } from '../../sitio.config.mjs'

export type Idioma = (typeof sitio.idiomas)[number]

export const idiomas: readonly Idioma[] = sitio.idiomas
export const idiomaDefault: Idioma = sitio.idiomaDefault
/** Idiomas con prefijo en la URL (todos menos el default). */
export const idiomasConPrefijo = idiomas.filter((i) => i !== idiomaDefault)

export function esIdioma(valor: string | undefined): valor is Idioma {
  return idiomas.includes(valor as Idioma)
}

/** Ruta absoluta del sitio (sin dominio) en un idioma: ruta('en', '/blog/') → '/en/blog/'. */
export function ruta(idioma: Idioma, camino: string): string {
  const limpio = camino.startsWith('/') ? camino : `/${camino}`
  const conBarra = limpio.endsWith('/') ? limpio : `${limpio}/`
  return idioma === idiomaDefault ? conBarra : `/${idioma}${conBarra}`
}

/** Para getStaticPaths de las páginas bajo src/pages/[lang]/. */
export function rutasDeIdiomas() {
  return idiomasConPrefijo.map((lang) => ({ params: { lang } }))
}
