// Instancia del catálogo para páginas e islas, configurada por variables de
// entorno (astro:env): PUBLIC_API_FUENTE=api|mock y PUBLIC_API_BASE_URL.
import { PUBLIC_API_BASE_URL, PUBLIC_API_FUENTE } from 'astro:env/client'

import { crearCatalogo } from './catalogo'

export const catalogo = crearCatalogo({ fuente: PUBLIC_API_FUENTE, baseUrl: PUBLIC_API_BASE_URL })

export type { Categoria, Pagina, Producto } from './tipos'
