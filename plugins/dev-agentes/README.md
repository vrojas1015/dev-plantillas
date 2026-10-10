# dev-agentes

Plugin de Claude Code con el flujo de trabajo de `dev-plantillas`: pocas piezas,
cada una basada en un paso real del trabajo, no un catálogo genérico.

## Instalar

```
/plugin marketplace add vrojas1015/dev-plantillas
/plugin install dev-agentes@dev-plantillas
```

Para probar cambios locales sin instalar: `claude --plugin-dir ./plugins/dev-agentes`.

## Contenido

| Tipo | Nombre | Qué hace |
|---|---|---|
| Skill | `/verificar` | Build, tests, lint y formato de cada proyecto tocado (Go, Node/Angular, Python); deja la evidencia en el issue |
| Hook | `guard-worktree` | Si la sesión trabaja en `worktrees/issue-<n>/`, bloquea ediciones a otros archivos del workspace (copias principales, otros issues). Permite la carpeta de su issue en el repo de documentación (`docs/contenido/issues/<n>-*/`, con o sin ceros a la izquierda; ver `docs/06-documentacion.md`), el formato anterior `docs/issues/<n>-*.md` y todo lo que esté fuera del workspace. Nunca otros issues ni `_generado/` |
| Hook | `format` | Después de cada edición: `gofmt`, `prettier` del proyecto o `ruff format`. Nunca bloquea |

### Variables para desactivar

| Variable | Efecto |
|---|---|
| `DEV_AGENTES_ALLOW_OUTSIDE=1` | Desactiva `guard-worktree` (editar fuera del issue a conciencia) |
| `DEV_AGENTES_NO_FORMAT=1` | Desactiva `format` |

Próximas piezas (ver `docs/03-flujo-de-trabajo.md`): revisores por stack (`go-reviewer`, `angular-reviewer`,
`migration-reviewer`), `/issue-start`, `/cerrar-issue`, `/nuevo-proyecto`.

## Diseño

- **Lo determinístico va en scripts**, no en el prompt. `/verificar` delega en
  `skills/verificar/scripts/verify.sh`, que se puede correr y testear sin agente:
  ```bash
  bash plugins/dev-agentes/skills/verificar/scripts/verify.sh [rutas...]
  ```
- **Costo de contexto bajo**: cada skill paga sólo su descripción (~150 tokens)
  en cada sesión; el cuerpo se carga al invocarla. Revisar con
  `claude --plugin-dir ./plugins/dev-agentes plugin details dev-agentes`.
- **Validación** en CI: `claude plugin validate --strict` y los tests de hooks
  (`bash plugins/dev-agentes/tests/hooks.test.sh`), que simulan el JSON que
  manda Claude Code, incluidas rutas de Windows.
- Los hooks son `bash` (en Windows, Claude Code los corre con Git Bash) y leen
  JSON con `jq`, `node` o `python`, lo que haya.
