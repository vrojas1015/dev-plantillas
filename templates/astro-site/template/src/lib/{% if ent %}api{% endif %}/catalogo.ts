// Cliente del catálogo. Dos fuentes con el MISMO contrato (tipos.ts):
//   api  → el api-gateway (PUBLIC_API_BASE_URL). Producción.
//   mock → fixtures/catalogo.json. Dev y CI, sin depender de una API levantada.
// No importa astro:env para poder usarse también desde astro.config.mjs (sitemap);
// la instancia configurada para páginas e islas está en ./index.ts.
import type { Categoria, Pagina, ParametrosBusqueda, Producto } from './tipos'

export interface OpcionesCatalogo {
  fuente: 'api' | 'mock'
  baseUrl: string
}

export class ErrorDeApi extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`La API respondió ${status} en ${url}`)
  }
}

const LIMITE = 12

export function crearCatalogo({ fuente, baseUrl }: OpcionesCatalogo) {
  const pedir = async <T>(
    camino: string,
    params: Record<string, string | undefined>,
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    const url = `${baseUrl}${camino}?${qs}`
    const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new ErrorDeApi(res.status, url)
    return (await res.json()) as T
  }

  async function buscar(p: ParametrosBusqueda, signal?: AbortSignal): Promise<Pagina<Producto>> {
    if (fuente === 'mock') return buscarEnFixture(p, signal)
    return pedir<Pagina<Producto>>(
      '/v1/catalogo',
      {
        lang: p.idioma,
        q: p.q,
        categoria: p.categoria,
        'page.cursor': p.cursor,
        'page.limit': String(p.limite ?? LIMITE),
      },
      signal,
    )
  }

  /** Producto por slug; null si no existe (la página responde 404 real). */
  async function obtener(slug: string, idioma: string): Promise<Producto | null> {
    if (fuente === 'mock') {
      const todos = await productosDelFixture(idioma)
      return todos.find((p) => p.slug === slug) ?? null
    }
    try {
      return await pedir<Producto>(`/v1/catalogo/${encodeURIComponent(slug)}`, { lang: idioma })
    } catch (e) {
      if (e instanceof ErrorDeApi && e.status === 404) return null
      throw e
    }
  }

  /** Todas las entidades (para getStaticPaths y el sitemap), página por página. */
  async function listarTodos(idioma: string): Promise<Producto[]> {
    const todos: Producto[] = []
    let cursor: string | undefined
    do {
      const pagina = await buscar({ idioma, cursor, limite: 100 })
      todos.push(...pagina.items)
      cursor = pagina.page.hasNextPage ? pagina.page.nextCursor : undefined
    } while (cursor)
    return todos
  }

  /** Categorías presentes en el catálogo (opciones del filtro). */
  async function categorias(idioma: string): Promise<Categoria[]> {
    const vistas = new Map<string, Categoria>()
    for (const p of await listarTodos(idioma)) vistas.set(p.categoria.slug, p.categoria)
    return [...vistas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, idioma))
  }

  return { buscar, obtener, listarTodos, categorias }
}

// ---------------------------------------------------------------------------
// Fuente mock: el fixture se importa dinámicamente, así no entra al bundle de
// producción (con fuente api nunca se ejecuta este código).
// ---------------------------------------------------------------------------

type Localizado = Record<string, string>

function elegir(textos: Localizado, idioma: string): string {
  return textos[idioma] ?? textos.es ?? Object.values(textos)[0] ?? ''
}

async function productosDelFixture(idioma: string): Promise<Producto[]> {
  const { default: datos } = await import('./fixtures/catalogo.json')
  const categorias = new Map(datos.categorias.map((c) => [c.slug, c.nombre as Localizado]))
  return datos.productos.map((p) => ({
    slug: p.slug,
    nombre: elegir(p.nombre, idioma),
    descripcion: elegir(p.descripcion, idioma),
    categoria: { slug: p.categoria, nombre: elegir(categorias.get(p.categoria) ?? {}, idioma) },
    precio: p.precio,
    moneda: p.moneda,
    actualizado: p.actualizado,
  }))
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

async function buscarEnFixture(
  { idioma, q, categoria, cursor, limite = LIMITE }: ParametrosBusqueda,
  signal?: AbortSignal,
): Promise<Pagina<Producto>> {
  // En el navegador simula la latencia de red: así se ve el estado de carga y se
  // ejercita la protección contra respuestas viejas.
  if (typeof window !== 'undefined') await esperar(150 + Math.random() * 250, signal)
  const termino = normalizar(q ?? '')
  const filtrados = (await productosDelFixture(idioma)).filter(
    (p) =>
      (!categoria || p.categoria.slug === categoria) &&
      (!termino || normalizar(`${p.nombre} ${p.descripcion}`).includes(termino)),
  )
  const desde = Number(cursor ?? 0) || 0
  const hasta = desde + limite
  return {
    items: filtrados.slice(desde, hasta),
    page: {
      nextCursor: hasta < filtrados.length ? String(hasta) : '',
      hasNextPage: hasta < filtrados.length,
    },
  }
}

function esperar(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(signal.reason)
    })
  })
}
