#!/usr/bin/env bash
# docs-registro.sh <repo docs generado> <registro.json>: la plantilla docs lee
# el registro de e2e-tests (docs/12 §3):
#   - sin REGISTRO_E2E nada cambia (validar OK, generados al día, sin página);
#   - con REGISTRO_E2E: página _generado/escenarios.md (y en el sitio), y
#     validar rechaza un issue `resuelto` con un escenario que no está ✅.
# El registro trae CU-001-1 ✅ y CU-001-4 en rojo (lo deja así verificar.sh).
set -euo pipefail
docs=$1
registro=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
cd "$docs"
PY=${PY:-python}

# Issue 001 resuelto, con Verificación y dos escenarios.
"$PY" -X utf8 - <<'PY'
import pathlib, re
p = pathlib.Path("contenido/issues/001-issue-de-ejemplo/issue.md")
s = p.read_text(encoding="utf-8")
s = s.replace("estado: abierto", "estado: resuelto").replace("resuelto: null", "resuelto: 2026-10-10")
s = re.sub(r"## Criterios de aceptación\n\n.*?\n## ", "## Criterios de aceptación\n\n"
           "- **CU-001-1** Dado un escritor, cuando crea un ítem, entonces un lector lo lee.\n"
           "- **CU-001-4** Dado un listado, cuando se pide, entonces responde 418.\n\n## ", s, flags=re.S)
s = re.sub(r"## Verificación\n\n<!--.*?-->", "## Verificación\n\n2026-10-10: e2e en CI.", s, flags=re.S)
p.write_text(s, encoding="utf-8", newline="\n")
PY
unset REGISTRO_E2E
make generar PY="$PY" >/dev/null
git add -A && git -c user.name=ci -c user.email=ci@example.com commit -qm "issue 001 resuelto"

echo "== sin REGISTRO_E2E: nada cambia"
make validar-frontmatter PY="$PY"
make generar PY="$PY"
git diff --exit-code -- contenido/_generado
test -z "$(git status --porcelain --untracked-files=all -- contenido/_generado)"
test ! -f contenido/_generado/escenarios.md

echo "== con REGISTRO_E2E: página de estado"
export REGISTRO_E2E="$registro"
make generar PY="$PY"
grep -F '| CU-001-1 | ✅ pasa |' contenido/_generado/escenarios.md
grep -F '| CU-001-4 | ❌ falla |' contenido/_generado/escenarios.md
test -z "$(git status --porcelain --untracked-files=all -- contenido/_generado)"   # escenarios.md ignorado por git
make comprobar-generado PY="$PY"
make construir PY="$PY" >/dev/null
test -f site/_generado/escenarios/index.html
grep -q 'Estado por escenario de la suite e2e' site/casos-de-uso/index.html

echo "== con REGISTRO_E2E: validar rechaza el issue resuelto con un escenario en rojo"
if make validar-frontmatter PY="$PY" 2> validar.err; then
  echo "ERROR: validar no detectó CU-001-4 en rojo"; exit 1
fi
cat validar.err
grep -q 'CU-001-4' validar.err
rm validar.err
echo "docs + registro: OK"
