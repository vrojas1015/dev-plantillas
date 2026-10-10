// Isla del buscador del catálogo (se hidrata con client:idle).
//
// Patrones (docs/seo.md, «Islas»):
//   1. Resultados iniciales en el HTML: llegan por props desde la página
//      (SSG/SSR); sin JS el catálogo igual se ve y se rastrea.
//   2. Estado en la URL (?q=…&cat=…): recargar o compartir mantiene la búsqueda.
//      La canónica de la página sigue siendo /catalogo/ (sin parámetros).
//   3. Respuestas viejas descartadas: cada pedido tiene un id; si al volver no
//      es el último, se ignora (y el anterior se aborta con AbortController).
//   4. Caché en sessionStorage + scroll: volver del detalle es instantáneo y
//      queda en la misma posición.
import { useEffect, useRef, useState, type SubmitEvent } from 'react'

import { t } from '@/i18n/textos'
import { catalogo, type Categoria, type Pagina, type Producto } from '@/lib/api'
import { escribirCache, leerCache } from '@/lib/cache-sesion'
import { useEstadoUrl } from '@/lib/estado-url'
import { ruta, type Idioma } from '@/lib/i18n'

interface Props {
  idioma: Idioma
  inicial: Pagina<Producto>
  categorias: Categoria[]
}

interface Instantanea {
  items: Producto[]
  cursor: string
  hayMas: boolean
  scrollY: number
}

const CLAVES = ['q', 'cat'] as const
const MAX_EN_CACHE = 60
const clave = (idioma: string, q: string, cat: string) => `buscador:${idioma}:${q}:${cat}`

export default function Buscador({ idioma, inicial, categorias }: Props) {
  const [params, escribirParams, listo] = useEstadoUrl(CLAVES)
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState(inicial.items)
  const [cursor, setCursor] = useState(inicial.page.nextCursor)
  const [hayMas, setHayMas] = useState(inicial.page.hasNextPage)
  const [estado, setEstado] = useState<'ok' | 'cargando' | 'error'>('ok')
  // Búsqueda a la que pertenecen los items mostrados (clave de la caché).
  const [resultadosDe, setResultadosDe] = useState(clave(idioma, '', ''))

  const ultimoPedido = useRef(0)
  const abortar = useRef<AbortController | null>(null)
  const scrollRestaurado = useRef(false)
  const instantanea = useRef<Instantanea>({ items, cursor, hayMas, scrollY: 0 })

  async function cargar(q: string, cat: string, desde?: string) {
    const id = ++ultimoPedido.current
    abortar.current?.abort()
    const control = new AbortController()
    abortar.current = control
    setEstado('cargando')
    try {
      const pagina = await catalogo.buscar(
        { idioma, q, categoria: cat, ...(desde && { cursor: desde }) },
        control.signal,
      )
      if (id !== ultimoPedido.current) return // respuesta vieja: se descarta
      setItems((previos) => (desde ? [...previos, ...pagina.items] : pagina.items))
      setResultadosDe(clave(idioma, q, cat))
      setCursor(pagina.page.nextCursor)
      setHayMas(pagina.page.hasNextPage)
      setEstado('ok')
    } catch {
      if (id !== ultimoPedido.current) return
      setEstado('error')
    }
  }

  // Cada vez que cambian los parámetros de la URL (al hidratar, al buscar, con
  // back/forward): caché → resultados iniciales → pedido a la API.
  useEffect(() => {
    if (!listo) return
    setTexto(params.q)
    const actual = clave(idioma, params.q, params.cat)
    const guardada = leerCache<Instantanea>(actual)
    if (guardada) {
      ultimoPedido.current++ // invalida cualquier pedido en vuelo
      setItems(guardada.items)
      setResultadosDe(actual)
      setCursor(guardada.cursor)
      setHayMas(guardada.hayMas)
      setEstado('ok')
      if (!scrollRestaurado.current && guardada.scrollY > 0) {
        requestAnimationFrame(() => window.scrollTo(0, guardada.scrollY))
      }
      scrollRestaurado.current = true
      return
    }
    scrollRestaurado.current = true
    if (!params.q && !params.cat) {
      ultimoPedido.current++
      setItems(inicial.items)
      setResultadosDe(actual)
      setCursor(inicial.page.nextCursor)
      setHayMas(inicial.page.hasNextPage)
      setEstado('ok')
      return
    }
    void cargar(params.q, params.cat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, params.q, params.cat])

  // Mientras se tipea: la URL se actualiza (sin ensuciar el historial) 300 ms
  // después de la última tecla.
  useEffect(() => {
    if (!listo || texto.trim() === params.q) return
    const espera = setTimeout(() => escribirParams({ ...params, q: texto.trim() }, 'replace'), 300)
    return () => clearTimeout(espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  // Persistir resultados y scroll de la búsqueda actual.
  useEffect(() => {
    if (!listo || estado !== 'ok') return
    instantanea.current = {
      items: items.slice(0, MAX_EN_CACHE),
      cursor,
      hayMas: hayMas || items.length > MAX_EN_CACHE,
      scrollY: window.scrollY,
    }
    escribirCache(resultadosDe, instantanea.current)
  }, [listo, estado, items, cursor, hayMas, resultadosDe])

  useEffect(() => {
    if (!listo) return
    let espera: ReturnType<typeof setTimeout> | undefined
    const guardarScroll = () =>
      escribirCache(resultadosDe, { ...instantanea.current, scrollY: window.scrollY })
    const alScrollear = () => {
      clearTimeout(espera)
      espera = setTimeout(guardarScroll, 100)
    }
    const alOcultar = () => document.visibilityState === 'hidden' && guardarScroll()
    window.addEventListener('scroll', alScrollear, { passive: true })
    window.addEventListener('pagehide', guardarScroll)
    document.addEventListener('visibilitychange', alOcultar)
    return () => {
      clearTimeout(espera)
      window.removeEventListener('scroll', alScrollear)
      window.removeEventListener('pagehide', guardarScroll)
      document.removeEventListener('visibilitychange', alOcultar)
    }
  }, [listo, resultadosDe])

  function alEnviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault()
    escribirParams({ ...params, q: texto.trim() }, 'push')
  }

  const precio = (p: Producto) =>
    new Intl.NumberFormat(idioma, { style: 'currency', currency: p.moneda }).format(p.precio)

  return (
    <div className="buscador">
      <form
        className="buscador__form"
        role="search"
        action={ruta(idioma, '/catalogo/')}
        method="get"
        onSubmit={alEnviar}
      >
        <div className="buscador__campo">
          <label htmlFor="buscador-q">{t(idioma, 'catalogo.buscar')}</label>
          <input
            id="buscador-q"
            name="q"
            type="search"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <div className="buscador__campo">
          <label htmlFor="buscador-cat">{t(idioma, 'catalogo.categoria')}</label>
          <select
            id="buscador-cat"
            name="cat"
            value={params.cat}
            onChange={(e) => escribirParams({ q: texto.trim(), cat: e.target.value }, 'push')}
          >
            <option value="">{t(idioma, 'catalogo.todas')}</option>
            {categorias.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="boton">
          {t(idioma, 'catalogo.enviar')}
        </button>
      </form>

      <p className="meta" aria-live="polite">
        {estado === 'cargando'
          ? t(idioma, 'catalogo.cargando')
          : `${items.length}${hayMas ? '+' : ''} ${t(idioma, 'catalogo.resultados')}`}
      </p>
      {estado === 'error' && <p role="alert">{t(idioma, 'catalogo.error')}</p>}

      {items.length === 0 && estado === 'ok' ? (
        <p>{t(idioma, 'catalogo.sinResultados')}</p>
      ) : (
        <ul className="tarjetas" aria-busy={estado === 'cargando'}>
          {items.map((p) => (
            <li key={p.slug} className="tarjeta">
              <h2>
                <a href={ruta(idioma, `/catalogo/${p.slug}/`)}>{p.nombre}</a>
              </h2>
              <p>{p.descripcion}</p>
              <p className="meta">
                {p.categoria.nombre} · {precio(p)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hayMas && (
        <p>
          <button
            type="button"
            className="boton boton--secundario"
            disabled={estado === 'cargando'}
            onClick={() => void cargar(params.q, params.cat, cursor)}
          >
            {t(idioma, 'catalogo.cargarMas')}
          </button>
        </p>
      )}
    </div>
  )
}
