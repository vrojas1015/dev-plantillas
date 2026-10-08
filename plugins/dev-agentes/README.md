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

Próximas piezas (ver `docs/03-flujo-de-trabajo.md`): hooks de formato y de
worktree, revisores por stack (`go-reviewer`, `angular-reviewer`,
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
- **Validación** en CI: `claude plugin validate --strict`.
