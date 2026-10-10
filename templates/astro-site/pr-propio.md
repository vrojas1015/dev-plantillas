- [ ] `npm run verificar` (lint + astro check + build + test de SEO + JSON-LD)
- [ ] `npm run lighthouse` si cambió el layout, una imagen o una isla
- [ ] Probado a mano con `npm run dev` (páginas tocadas, con y sin JS)

## SEO

- [ ] Toda página nueva usa `<Base>` (y por lo tanto `<Seo>`) con title y description propios
- [ ] Si se movió o borró una URL publicada: entrada en `redirects.json`
- [ ] Islas nuevas con `client:visible` / `client:idle` (o `client:load` justificado acá)
