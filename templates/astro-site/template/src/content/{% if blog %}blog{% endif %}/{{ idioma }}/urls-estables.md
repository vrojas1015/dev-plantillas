---
title: "Por qué nuestras URLs no cambian"
description: "Slugs legibles, una sola política de barra final y redirecciones 301 declaradas en un único archivo que el CI controla."
publishDate: 2026-07-20
---

Una URL publicada es una promesa: alguien la guardó, la compartió o la tiene
indexada. Por eso:

1. El **slug** es legible y estable (`/blog/urls-estables/`), nunca un id.
2. Todas las URLs terminan con barra; la otra forma redirige.
3. Si una página se mueve o se borra, la ruta vieja va a `redirects.json` con
   su destino nuevo, y el servidor responde **301**.

El CI compara las rutas del build contra el sitemap publicado en producción:
si una ruta desaparece sin redirección, el pipeline falla.
