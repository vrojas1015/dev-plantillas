// robots.txt por ambiente: sólo prod se indexa. QA, previews y dev cierran todo
// (además de llevar <meta name="robots" content="noindex,nofollow">).
import type { APIRoute } from 'astro'
import { PUBLIC_ENTORNO } from 'astro:env/client'

export const prerender = true

export const GET: APIRoute = ({ site }) => {
  const cuerpo =
    PUBLIC_ENTORNO === 'prod'
      ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`
      : `# Ambiente ${PUBLIC_ENTORNO}: no indexar.\nUser-agent: *\nDisallow: /\n`
  return new Response(cuerpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
