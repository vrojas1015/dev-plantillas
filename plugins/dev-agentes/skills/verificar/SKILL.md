---
name: verificar
description: Verifica que el trabajo actual compila y pasa sus chequeos (build, tests, lint, formato) en cada proyecto tocado — Go, Node/Angular o Python — y deja la evidencia en el issue. Usar antes de dar algo por terminado, antes de abrir un MR/PR, o cuando el usuario pide "verificá", "corré los tests", "¿está todo verde?".
---

# /verificar

Corre los chequeos de cada proyecto con un script determinístico y reporta
**sólo lo que realmente se ejecutó**. Nunca digas que algo pasa sin haber visto
su línea `RESULT PASS`.

## 1. Alcance

- Si el usuario pasó rutas, verificá esas.
- Si no, el directorio actual. El script detecta solo si es un proyecto o una
  carpeta de issue con varios repos adentro (`worktrees/issue-<n>/`).

## 2. Ejecutar

```bash
bash "<directorio de esta skill>/scripts/verify.sh" [rutas...]
```

Cada paso imprime `RESULT <PASS|FAIL|SKIP> <proyecto> <paso> <segundos>s [motivo]`
y, si falla, las últimas líneas de su salida. Exit 0 = todo verde, 1 = algo
falló, 2 = no encontró proyectos.

| Stack | Detecta | Pasos |
|---|---|---|
| Go | `go.mod` | build, vet, test, gofmt |
| Node | `package.json` | lint, test:unit (o test), build — sólo los scripts que existan |
| Python | `pyproject.toml` / `requirements.txt` | ruff (si está), pytest |

**SKIP por dependencias faltantes** (`npm ci`): si hay `package-lock.json`,
corré `npm ci` en ese proyecto y volvé a verificar sólo ese proyecto. Otro SKIP
(herramienta no instalada) se reporta tal cual; no lo instales sin preguntar.

## 3. Si algo falla

- Leé el error real (las líneas que imprime el script, o el log completo).
- Explicá la causa en una o dos líneas, con `archivo:línea`.
- **No arregles nada en esta skill** salvo que el usuario lo haya pedido: el
  objetivo es saber el estado real. Ofrecé el arreglo.
- Errores ajenos a los cambios del issue (tests que ya fallaban en `main`):
  decilo explícitamente, no los mezcles con los del cambio.

## 4. Reporte

Respondé con una tabla y una línea de veredicto:

| Proyecto | Paso | Resultado | Tiempo |
|---|---|---|---|
| orders-service | test | ✅ | 11s |
| admin-web | build | ❌ `src/app/x.ts:42` tipo incompatible | 36s |

**Veredicto:** listo para MR / no listo (n fallos).

## 5. Evidencia en el issue

Si se trabaja en `worktrees/issue-<n>/` y existe el issue en
`<workspace>/docs/issues/<n>-*.md`, agregá (o reemplazá, si ya existe) al
final del archivo una sección:

```markdown
## Verificación — <fecha absoluta, AAAA-MM-DD>

| Proyecto | Paso | Resultado |
|---|---|---|
| ... | ... | ✅ / ❌ / ⏭️ motivo |

Comando: `verify.sh <rutas>` · commit `<sha corto de cada repo>`
```

Sólo ese archivo: nunca toques otros issues ni archivos agregados (rollout,
índices). Si no hay issue identificable, no escribas nada y decilo.
