// Contratos del api-gateway para el catálogo. Copiados del contrato del backend
// (protos/OpenAPI); si el backend cambia, se cambian acá y `astro check` marca
// todo lo que hay que adaptar.
//
//   GET /v1/catalogo?lang=es&q=&categoria=&page.cursor=&page.limit=  → Pagina<Producto>
//   GET /v1/catalogo/{slug}?lang=es                                  → Producto | 404

export interface Categoria {
  slug: string
  nombre: string
}

export interface Producto {
  /** Estable y legible (kebab-case). Si cambia, el viejo redirige con 301. */
  slug: string
  nombre: string
  descripcion: string
  categoria: Categoria
  precio: number
  /** ISO 4217 (EUR, USD, ARS...). */
  moneda: string
  /** ISO 8601. Se usa como lastmod del sitemap. */
  actualizado: string
}

export interface Pagina<T> {
  items: T[]
  page: {
    nextCursor: string
    hasNextPage: boolean
  }
}

export interface ParametrosBusqueda {
  idioma: string
  q?: string
  categoria?: string
  cursor?: string
  limite?: number
}
