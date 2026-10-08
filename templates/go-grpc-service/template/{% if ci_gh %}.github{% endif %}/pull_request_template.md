## Qué cambia

<!-- Una o dos líneas. Referenciá el issue: Closes #<n> -->

## Cómo se probó

- [ ] `go build ./... && go vet ./...`
- [ ] `go test -count=1 ./...`
- [ ] Probado contra la base local (`make run` + grpcurl) en los RPC tocados

## Migraciones

- [ ] No toca `migrations/`
- [ ] Toca `migrations/`: tiene `down`, se probó up→down→up, y el deploy a prod requiere aplicar el SQL a mano

## Notas para el review

<!-- Decisiones, deuda que queda, cambios de protos relacionados (link al MR). -->
