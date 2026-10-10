// Helpers de SEO: títulos, URLs absolutas y JSON-LD comunes. Los tipos de
// schema-dts hacen que un JSON-LD mal formado no compile (astro check).
import type {
  BreadcrumbList,
  Organization,
  SearchAction,
  Thing,
  WebSite,
  WithActionConstraints,
} from 'schema-dts'

import { sitio } from '../../sitio.config.mjs'

/** Un nodo de schema.org como objeto (los tipos de schema-dts también admiten un string). */
export type Nodo<T extends Thing = Thing> = Exclude<T, string>

/** Formato único de título: «Página · Sitio» (la home usa sólo el nombre del sitio). */
export function titulo(pagina?: string): string {
  return pagina ? `${pagina} · ${sitio.nombre}` : sitio.nombre
}

/** URL absoluta de producción para canonical, og:url, hreflang y JSON-LD. */
export function urlAbsoluta(camino: string): string {
  return new URL(camino, sitio.url).href
}

/**
 * Description para textos que vienen de la API (largo no controlado): corta en
 * 160 caracteres sin partir palabras. El contenido propio se valida con zod.
 */
export function descripcionMeta(texto: string, maximo = 160): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio.length <= maximo) return limpio
  const corte = limpio.slice(0, maximo - 1)
  return `${corte.slice(0, corte.lastIndexOf(' '))}…`
}

export interface Miga {
  nombre: string
  camino: string
}

/** BreadcrumbList para toda página con jerarquía (la última miga es la página actual). */
export function migas(items: Miga[]): BreadcrumbList {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nombre,
      item: urlAbsoluta(m.camino),
    })),
  }
}

export function organizacion(): Nodo<Organization> {
  return {
    '@type': 'Organization',
    '@id': urlAbsoluta('/#organizacion'),
    name: sitio.nombre,
    url: urlAbsoluta('/'),
    logo: urlAbsoluta('/favicon.svg'),
  }
}

/** WebSite; con `rutaBusqueda`, agrega la SearchAction (cuadro de búsqueda en Google). */
export function sitioWeb(idioma: string, rutaBusqueda?: string): WebSite {
  // query-input no es una propiedad común: schema-dts la tipa con WithActionConstraints.
  const busqueda: WithActionConstraints<SearchAction> | undefined = rutaBusqueda
    ? {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${urlAbsoluta(rutaBusqueda)}?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      }
    : undefined
  return {
    '@type': 'WebSite',
    '@id': urlAbsoluta('/#sitio'),
    name: sitio.nombre,
    url: urlAbsoluta('/'),
    inLanguage: idioma,
    publisher: { '@id': urlAbsoluta('/#organizacion') },
    ...(busqueda && { potentialAction: busqueda }),
  }
}
