# Frontend — Convenciones comunes

Aplica a toda app bajo `frontend\`.

## Stack

Angular (standalone components) · Signals + stores propios · SCSS + BEM ·
vitest (unit) · Playwright (e2e) · prettier (printWidth 100, singleQuote).

## Estructura de `src/app`

| Carpeta | Va |
|---|---|
| `api/` | Clientes HTTP tipados contra el api-gateway. Nada de UI |
| `core/` | Auth, interceptors, guards, config. Singletons |
| `features/<feature>/` | Páginas + store de la feature. Una feature no importa de otra |
| `layout/` | Shell, navegación |
| `ui/` | Componentes presentacionales reutilizables, sin estado de negocio |

## Reglas

- Estado: `signal`/`computed` en un store por feature; los componentes no llaman HTTP directo.
- Estilos: BEM (`bloque__elemento--modificador`), variables en `src/styles`.
- **Si el gateway no expone lo que hace falta, no se inventa en el front:** se abre
  un issue en `docs\issues` describiendo el endpoint, y se sigue el orden
  protos → micro → api-gateway → front.
- Nada de secretos en `environments/`: sólo URLs públicas y config de cliente.

## Comandos

```bash
npm start | npm run build | npm run test:unit | npm run test:e2e | npm run format
```
