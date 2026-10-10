- [ ] `npm run typecheck` y `npm run listar`
- [ ] `E2E_AMBIENTE=<local|qa> npm run e2e` en verde (o el subconjunto: `npm run e2e -- --grep @CU-…`)
- [ ] Si toca robustez o carga: `npm run robustez` / `npm run carga`

## Escenarios cubiertos

<!-- Un test por escenario de aceptación del issue, con su etiqueta. -->

- [ ] `@CU-<issue>-<n>`: …

## Checklist de pruebas

- [ ] Cada test nuevo lleva `@CU-…` (si cubre un escenario) y `@smoke` o `@regresion`
- [ ] Los datos son sintéticos y llevan el prefijo de la corrida (`datos.nombre(...)`); nada de datos reales ni personales
- [ ] Cada test crea lo que necesita y no depende del orden ni de otros tests
- [ ] La UI se toca sólo a través de Page Objects (`tests/web/paginas/`)
- [ ] Un test nuevo en `@inestable` tiene issue y fecha límite (2 semanas)
- [ ] Sin credenciales ni tokens en el código, los reportes ni los logs
