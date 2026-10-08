# Ejercicio 1 — Diseñar el subagente `go-reviewer`

**Objetivo:** escribir un subagente que revise cambios Go contra las reglas de la
plantilla `go-grpc-service`, y **medir** si funciona con evals.

**Archivo a completar:** `plugins/dev-agentes/agents/go-reviewer.md`
(el frontmatter ya está; completás las 5 secciones marcadas con TODO).

**Lo que vas a practicar:** convertir convenciones de equipo en reglas
verificables, controlar falsos positivos, diseñar una salida estable y probar
un agente como se prueba código.

---

## Conceptos en 2 minutos

- **Subagente** = un prompt de sistema + un set de herramientas, con su propio
  contexto. Claude lo invoca cuando la `description` del frontmatter coincide
  con la tarea, o cuando se le pide por nombre. Devuelve un resumen; su
  contexto (todos los archivos que leyó) no ensucia la sesión principal.
- **Una responsabilidad.** `go-reviewer` sólo revisa Go. No arregla, no corre
  tests (eso es `/verificar`), no revisa Angular.
- **Herramientas mínimas.** `Read, Grep, Glob, Bash` (Bash sólo para `git diff`
  y `git log`). Sin `Edit`/`Write`: un revisor que edita deja de ser revisor.
- **El prompt es código.** Se versiona, se revisa en PR y se prueba con evals.

## Principios para que un revisor sirva

1. **Reglas verificables, no adjetivos.** «El código debe ser limpio» no se
   puede chequear. «`app/domain/**` no importa `gorm.io/*` ni paquetes de
   `gen/`» sí: se busca con un grep.
2. **Cada hallazgo con evidencia:** `archivo:línea` + la regla + por qué
   importa. Sin evidencia, no se reporta.
3. **Precisión antes que cantidad.** Diez hallazgos dudosos hacen que nadie lea
   el reporte. Mejor tres seguros. Decí explícitamente qué *no* reportar.
4. **Sólo el diff.** Revisar todo el repo en cada MR es lento y mezcla deuda
   vieja con el cambio. Si ve algo grave fuera del diff, lo menciona aparte.
5. **Salida fija.** Mismo formato siempre: lo lee una persona y también otra
   skill (más adelante, `/cerrar-issue` lo va a usar para decidir si abre el MR).

## Pasos

1. **Leé la fuente de las reglas:**
   `templates/go-grpc-service/template/CLAUDE.md.jinja` y el código de ejemplo
   de la plantilla (`app/`), para ver cómo se ve el código «correcto».
2. **Escribí la sección 2 (reglas) primero.** Es el corazón. Para cada regla
   anotá cómo se detecta. Empezá por 6–10 reglas; se agregan después.
3. **Secciones 3 y 4:** qué no reportar y severidades.
4. **Sección 5:** formato de salida. Escribí un ejemplo completo de reporte
   dentro del prompt: los modelos copian ejemplos mejor que descripciones.
5. **Sección 1:** cómo obtiene el diff (`git merge-base`, `git diff`), y qué
   hace si no hay cambios Go.
6. **Probalo a mano** sobre un proyecto generado (ver abajo).
7. **Corré las evals** y ajustá hasta que pasen.
8. **PR** con el reporte de evals en la descripción.

## Probar a mano

```bash
# Proyecto de prueba
python -m copier copy --defaults --trust -d service_name=demo templates/go-grpc-service /tmp/demo-service
cd /tmp/demo-service && git init -q && git add . && git commit -qm base

# Introducí un error a propósito, por ejemplo en app/domain/model/item.go:
#   import "gorm.io/gorm"   y un campo con tag gorm
# Después, con el plugin cargado:
claude --plugin-dir <ruta>/dev-plantillas/plugins/dev-agentes
> Usá go-reviewer para revisar mis cambios sin commitear
```

## Evals

En `plugins/dev-agentes/evals/go-reviewer/` hay tres casos. Cada uno arma con
`scaffold.sh` un repo con un commit base y el cambio **sin commitear**, como en
un MR real:

| Caso | Qué mide |
|---|---|
| `dominio-importa-gorm` | Detecta GORM en el modelo de dominio |
| `handler-con-logica` | Detecta los 3 problemas: lógica de negocio en el handler, `fmt.Errorf` con sentinel, error sin `MapToGRPC` |
| `cambio-limpio` | **Falsos positivos**: un cambio correcto no debe tener bloqueantes |

```bash
cd plugins/dev-agentes
# Iterando (sin baseline, más barato):
claude plugin eval . --case 'go-reviewer-*' --scaffold --ablation none --no-publish
# Final (con baseline: compara con y sin plugin):
claude plugin eval . --case 'go-reviewer-*' --scaffold --no-publish
```

- Cada caso corre 3 veces (`runs: 3`). Costo aproximado: ~US$0.55 por caso sin
  baseline; el doble con baseline.
- En las evals el agente **no tiene Bash** (en Windows no hay sandbox para
  darlo). Tu sección 1 tiene que funcionar igual: si no puede correr
  `git diff`, revisa los archivos nuevos/modificados con `Glob`/`Read`.
- **Dato importante:** con el esqueleto vacío, el caso `dominio-importa-gorm`
  ya pasa: Claude sabe qué es una arquitectura hexagonal. Lo que tu prompt
  tiene que aportar son **las reglas propias** de la plantilla (los
  constructores de `domainerrors`, `MapToGRPC`, mocks con campos `func`,
  migraciones). Parte del ejercicio: **agregar 2 casos difíciles** que el
  esqueleto vacío no pase y tu versión sí. Ideas: un test que usa `testify`;
  una migración con `ADD COLUMN ... DEFAULT false` sin `down`; un repo que
  devuelve `gorm.ErrRecordNotFound` crudo.

## Criterios de terminado

- [ ] Las 5 secciones completas, sin comentarios TODO.
- [ ] Prueba manual: detecta el error introducido con `archivo:línea` correcto.
- [ ] 2 casos nuevos que el esqueleto vacío no pasa.
- [ ] Evals: todos los casos pasan; en el caso limpio, cero bloqueantes.
- [ ] Con baseline: el score con plugin es mayor que sin plugin.
- [ ] `claude plugin validate --strict plugins/dev-agentes` pasa.
- [ ] El prompt cabe en ~150 líneas. Si crece más, probablemente esté
      explicando lo que el modelo ya sabe de Go.

## Cuando lo tengas

Abrí el PR y pedime revisión. Voy a revisar: si las reglas son verificables,
si el formato es estable, y los resultados de las evals.
