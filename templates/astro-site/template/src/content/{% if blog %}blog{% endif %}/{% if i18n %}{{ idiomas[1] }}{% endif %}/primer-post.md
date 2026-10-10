---
title: "How we measure the site's performance"
description: "What Lighthouse CI checks on every merge request, which thresholds we use and how to read a report when the pipeline fails."
publishDate: 2026-09-01
updatedDate: 2026-09-15
---

<!-- Traducción de ejemplo del primer post (mismo nombre de archivo = misma
página en otro idioma: así se arman el hreflang y el sitemap). Reemplazala por
el texto en el idioma de esta carpeta. -->

Every change that reaches the main branch goes through **Lighthouse CI**. If
the SEO score drops below 100, or the mobile performance score drops below 90,
the pipeline fails and the change is not published.

## What we measure

- **LCP** (Largest Contentful Paint): how long the largest element on screen
  takes to appear. Target: under 2.5 seconds.
- **CLS** (Cumulative Layout Shift): how much the content "jumps" while it
  loads. Target: under 0.1.
- **INP** (Interaction to Next Paint): how long the page takes to respond to a
  click or a key press. Target: under 200 milliseconds.
