# Ejercicio 2 — CLI `dp`, hito H1: esqueleto y `dp list`

**Objetivo:** que `dp --version` y `dp list` funcionen, instalables como
paquete, con los tests en verde y en el CI.

**Especificación:** `docs/08-cli-dp.md` (§2 decisiones, §3 catálogo, §5
convenciones, §7 estructura). Este hito cubre sólo lo marcado acá.

**Lo que vas a practicar:** estructura de un paquete Python moderno (`src/`
layout, `pyproject.toml`), una CLI con tipos (Typer), separar lógica de
presentación, y **desarrollo guiado por tests**: los tests ya están escritos y
definen el comportamiento; tu trabajo es hacerlos pasar.

---

## Lo que ya está

| Archivo | Qué es |
|---|---|
| `catalogo.yaml` (raíz del repo) | El catálogo real con las 8 plantillas publicadas |
| `cli/tests/conftest.py` | Fixtures: un catálogo temporal válido y una función para escribir catálogos rotos |
| `cli/tests/test_catalogo.py` | 13 tests de la **lógica**: leer y validar el catálogo |
| `cli/tests/test_list.py` | 10 tests de la **CLI**: `--version`, `list`, filtros, `--json`, errores, dónde busca el catálogo |

Los tests están verificados: con una implementación correcta pasan los 23.

## Lo que tenés que escribir

```
cli/
├── pyproject.toml
└── src/dp/
    ├── __init__.py      ← __version__ = "0.1.0"
    ├── catalogo.py      ← la lógica (sin nada de Typer ni de consola)
    └── main.py          ← la CLI (Typer); llama a catalogo.py y presenta
```

### Contrato que piden los tests

**`dp/catalogo.py`**

- `Plantilla`: dataclass inmutable con `nombre`, `repo`, `tipo`, `lenguaje`,
  `descripcion` (todos `str`). Los campos extra del YAML (`atajos`,
  `destino_por_defecto`) se ignoran por ahora.
- `CatalogoInvalido`: excepción (subclase de `ValueError`). Su mensaje dice
  **qué** está mal: archivo inexistente, YAML roto, `version` distinta de 1,
  campo faltante (nombrándolo), tipo desconocido (nombrándolo), nombre duplicado.
- `cargar_catalogo(ruta: Path) -> list[Plantilla]`: en el orden del archivo.
- Tipos válidos: `backend`, `gateway`, `contratos`, `front`, `movil`, `docs`, `pruebas`.

**`dp/main.py`**

- `app`: la aplicación Typer.
- `dp --version` → imprime exactamente `dp 0.1.0` y sale con 0.
- `dp list [--catalogo RUTA] [--tipo TIPO] [--json]`:
  - Dónde busca el catálogo, en este orden: `--catalogo` → variable de entorno
    `DP_CATALOGO` → `catalogo.yaml` subiendo desde el directorio actual (como
    git busca `.git`).
  - Sin `--json`: una tabla legible (Rich).
  - Con `--json`: una lista de objetos con exactamente las 5 claves, en el orden
    del catálogo.
  - Errores → **exit 1**, un mensaje claro y **sin traceback**: catálogo
    inválido, no encontrado (el mensaje menciona `catalogo.yaml`), tipo
    desconocido (el mensaje lista los válidos).

## Pasos sugeridos

1. **`pyproject.toml`** con `src/` layout, backend `hatchling`, dependencias
   `typer`, `rich`, `pyyaml` (versiones fijadas), extra `dev` con `pytest`, y el
   entry point `dp = "dp.main:app"`.
2. Entorno e instalación en modo editable:
   ```powershell
   cd C:\dev\dev-plantillas-wt\cli\cli
   python -m venv .venv
   .venv\Scripts\python -m pip install -e ".[dev]"
   .venv\Scripts\python -m pytest -q        # ahora fallan todos: es lo esperado
   ```
3. **`catalogo.py` primero**, guiado por `test_catalogo.py`:
   `pytest -q tests/test_catalogo.py`. Es lógica pura: ni Typer ni `print`.
4. **`main.py` después**, guiado por `test_list.py`.
5. Probalo a mano: `dp list`, `dp list --tipo front`, `dp list --json`, y
   desde otra carpeta.
6. **CI:** agregá un job `cli` en `.github/workflows/templates.yml` que instale
   el paquete y corra `pytest` en **ubuntu-latest y windows-latest** (matriz).
7. PR con la salida de `pytest` en la descripción.

## Pistas (sin la solución)

- `--version` en Typer: un `@app.callback()` con una opción `is_eager=True` y un
  callback que imprime y lanza `typer.Exit()`.
- Errores sin traceback: atrapá `CatalogoInvalido` en el comando, imprimí el
  mensaje y `raise typer.Exit(code=1)`.
- Subir directorios: `Path.cwd().resolve()` y su atributo `.parents`.
- `dataclasses.asdict` para el `--json`; `ensure_ascii=False` para que los
  acentos salgan bien.
- `yaml.safe_load`, nunca `yaml.load`.
- Si la tabla de Rich corta los nombres en los tests, fijá el ancho de la
  consola.

## Criterios de terminado

- [ ] Los 23 tests pasan en Windows (tu máquina) y en el CI (ubuntu + windows).
- [ ] `dp --version`, `dp list`, `dp list --tipo front`, `dp list --json`
      funcionan desde cualquier carpeta dentro del repo.
- [ ] `catalogo.py` no importa Typer ni Rich.
- [ ] Ningún error muestra un traceback.

## Cuando lo tengas

Abrí el PR y pedime revisión. Voy a mirar: separación lógica/presentación,
mensajes de error, y que el `pyproject.toml` quede listo para `uv tool install`.
