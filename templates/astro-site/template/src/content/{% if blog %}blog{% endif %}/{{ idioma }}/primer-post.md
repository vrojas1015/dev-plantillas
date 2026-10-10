---
title: "Cómo medimos el rendimiento del sitio"
description: "Qué controla Lighthouse CI en cada merge request, qué umbrales usamos y cómo leer un reporte cuando el pipeline falla."
publishDate: 2026-09-01
updatedDate: 2026-09-15
image: ./primer-post.jpg
imageAlt: Formas geométricas verdes sobre un fondo degradado
---

Cada cambio que llega a la rama principal pasa por **Lighthouse CI**. Si el
puntaje de SEO baja de 100, o el de rendimiento en móvil baja de 90, el
pipeline falla y el cambio no se publica.

## Qué medimos

- **LCP** (Largest Contentful Paint): cuánto tarda en verse el elemento más
  grande de la pantalla. Objetivo: menos de 2,5 segundos.
- **CLS** (Cumulative Layout Shift): cuánto "salta" el contenido mientras
  carga. Objetivo: menos de 0,1.
- **INP** (Interaction to Next Paint): cuánto tarda la página en responder a
  un clic o una tecla. Objetivo: menos de 200 milisegundos.

## Cómo leer un reporte

El job de Lighthouse deja el reporte HTML como artefacto. Empezá por la
sección _Oportunidades_: casi siempre el problema es una imagen sin optimizar
o un script que bloquea el render.
