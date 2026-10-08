# Flujo de trabajo con agentes

Una forma de trabajar para todo el equipo, pensada para varias sesiones de
agentes en paralelo (Herdr, terminales separadas, etc.).

## Unidad de trabajo: el issue

```
issue  →  worktrees  →  sesión  →  verificar  →  MR  →  cerrar
```

1. **Issue** en `docs\issues\<n>-<slug>.md`: qué, por qué, criterios de aceptación,
   repos afectados.
2. **Worktrees**, uno por repo que toca:
   ```powershell
   cd C:\dev\<org>
   .\plantillas\scripts\new-worktree.ps1 -Issue 42 -Slug descuentos `
       -Repos backend\protos,backend\orders-service,backend\api-gateway
   ```
3. **Una sesión de agente** abierta en `worktrees\issue-42\`. En Herdr: un
   workspace por issue. La sesión ve todos los repos del issue y lee los
   `CLAUDE.md` de la plataforma por herencia de carpetas.
4. **Plan antes de código** en cambios que cruzan repos o tocan migraciones
   (modo plan): se aprueba el orden protos → micro → gateway → front.
5. **Verificar**: tests, build, `/code-review`. La evidencia se anota en el issue.
6. **MR por repo**, con el template. El MR de protos se mergea y se taggea primero.
7. **Cerrar**: `git worktree remove` de cada repo y borrar `worktrees\issue-<n>`.

## Paralelismo sin pisarse

| Regla | Por qué |
|---|---|
| Una sesión por issue, nunca dos en el mismo worktree | Dos agentes editando el mismo árbol se pisan sin aviso |
| La copia principal de cada repo no se toca | Es la base para crear worktrees; si está sucia, todo lo que sale de ahí arrastra basura |
| En `docs`, cada sesión escribe sólo el archivo de su issue | El índice de git es uno por clon: dos sesiones commiteando en el mismo clon mezclan cambios |
| Los archivos agregados (rollout, índices) los actualiza una persona o un job | Mismo motivo |

## Roles útiles

- **Implementador**: la sesión del issue.
- **Revisor**: `/code-review` en el worktree, o una segunda sesión de sólo lectura
  sobre el diff del MR. Nunca edita.
- **Humano**: aprueba el plan, aprueba el MR, aplica migraciones a prod y taggea `prod-v*`.

## Crear un servicio o app nuevos

1. Issue con nombre, dominio, puerto y schema.
2. `copier copy` desde la plantilla (ver `02-repositorios-gitlab-github.md` §6).
3. Crear el repo remoto y aplicar la configuración obligatoria (§4).
4. Infra de una vez: `docs/ci-cd-setup.md` del repo generado.
5. Agregarlo a `workspace\repos.txt` para que el resto del equipo lo clone.
