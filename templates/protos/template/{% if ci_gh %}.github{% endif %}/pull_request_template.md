## Qué cambia en el contrato

<!-- RPCs/mensajes/campos nuevos o deprecados. Referenciá el issue: Closes #<n> -->

## Checklist de contratos

- [ ] Solo cambios aditivos en el paquete vN (o paquete v(N+1) nuevo si es incompatible)
- [ ] Ningún campo borrado de un vN publicado (`[deprecated = true]`); ningún número reusado ni renumerado
- [ ] Enums nuevos con `<ENUM>_UNSPECIFIED = 0`; `optional` donde importa la presencia
- [ ] `make lint` y `make breaking` en verde
- [ ] `make generate` corrido y `gen/` commiteado en este mismo PR

## Consumidores

<!-- Servicios / gateway / front que adoptan este cambio y en qué orden
     (protos → servicio → gateway → front). Links a sus MRs. -->
