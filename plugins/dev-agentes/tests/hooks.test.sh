#!/usr/bin/env bash
# Tests de los hooks: arman el JSON que manda Claude Code y comprueban el exit.
#   bash plugins/dev-agentes/tests/hooks.test.sh
set -uo pipefail
HOOKS="$(cd "$(dirname "$0")/../hooks" && pwd)"
pass=0; fail=0

check() { # descripción exit-esperado json [env]
  local desc=$1 want=$2 json=$3 got
  printf '%s' "$json" | env ${4:-} bash "$HOOKS/guard-worktree.sh" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $desc (exit $got, esperado $want)"; fi
}
# Arma el evento escapando las \ como en un JSON real.
esc() { local s=$1; s=${s//'\'/'\\'}; printf '%s' "$s"; }
ev() { printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$(esc "$1")" "$(esc "$2")"; }

W=/home/dev/org
I=$W/worktrees/issue-42
check "dentro del worktree"             0 "$(ev "$I" "$I/orders-service/app/x.go")"
check "ruta relativa dentro"            0 "$(ev "$I/orders-service" "app/x.go")"
check "copia principal del repo"        2 "$(ev "$I" "$W/backend/orders-service/app/x.go")"
check "worktree de otro issue"          2 "$(ev "$I" "$W/worktrees/issue-7/foo/x.go")"
check "prefijo engañoso issue-420"      2 "$(ev "$I" "$W/worktrees/issue-420/x.go")"
check "su propio issue en docs"         0 "$(ev "$I" "$W/docs/issues/42-descuentos.md")"
check "issue con ceros a la izquierda"  0 "$(ev "$I" "$W/docs/issues/042-descuentos.md")"
check "otro issue en docs"              2 "$(ev "$I" "$W/docs/issues/43-otro.md")"
check "archivo agregado de docs"        2 "$(ev "$I" "$W/docs/rollout.md")"
# Repo docs con carpeta por issue (plantilla docs): contenido/issues/<n>-<slug>/
D=$W/docs/contenido
check "carpeta: su issue.md"            0 "$(ev "$I" "$D/issues/042-descuentos/issue.md")"
check "carpeta: su plan.md sin ceros"   0 "$(ev "$I" "$D/issues/42-descuentos/plan.md")"
check "carpeta: subcarpeta propia"      0 "$(ev "$I" "$D/issues/042-descuentos/evidencia/log.txt")"
check "carpeta: issue 43"               2 "$(ev "$I" "$D/issues/043-otro/issue.md")"
check "carpeta: 0420 no es 42"          2 "$(ev "$I" "$D/issues/0420-otro/issue.md")"
check "carpeta: la carpeta sola"        2 "$(ev "$I" "$D/issues/042-descuentos")"
check "carpeta: archivo suelto"         2 "$(ev "$I" "$D/issues/042-descuentos.md")"
check "carpeta: escapar con .."         2 "$(ev "$I" "$D/issues/042-descuentos/../043-otro/issue.md")"
check "carpeta: _generado"              2 "$(ev "$I" "$D/_generado/issues-por-estado.md")"
check "carpeta: adr"                    2 "$(ev "$I" "$D/adr/0001-registrar-decisiones.md")"
check "carpeta: _plantillas"            2 "$(ev "$I" "$W/docs/_plantillas/issue.md")"
I420=$W/worktrees/issue-420
check "carpeta: issue-420 vs 042"       2 "$(ev "$I420" "$D/issues/042-descuentos/issue.md")"
check "carpeta: issue-420 su carpeta"   0 "$(ev "$I420" "$D/issues/420-grande/issue.md")"
check "fuera del workspace"             0 "$(ev "$I" "/tmp/scratch/notas.md")"
check "sesión fuera de worktree"        0 "$(ev "$W/backend/orders-service" "$W/backend/orders-service/x.go")"
check "sin file_path"                   0 '{"cwd":"'"$I"'","tool_name":"Edit","tool_input":{}}'
check "escape con variable"             0 "$(ev "$I" "$W/backend/orders-service/x.go")" DEV_AGENTES_ALLOW_OUTSIDE=1

# Rutas Windows y mayúsculas distintas
WW='C:\dev\org'
check "win: dentro"                     0 "$(ev "$WW\worktrees\issue-42" "$WW\worktrees\issue-42\api\x.go")"
check "win: copia principal"            2 "$(ev "$WW\worktrees\issue-42" "$WW\backend\api\x.go")"
check "win: mezcla / y \ y mayúsculas"  0 "$(ev "c:/dev/org/worktrees/issue-42" 'C:\Dev\Org\worktrees\issue-42\api\x.go')"
check "win: estilo /c/ de git bash"     2 "$(ev "/c/dev/org/worktrees/issue-42" "$WW\backend\api\x.go")"
check "win: otro issue en docs"         2 "$(ev "$WW\worktrees\issue-42" "$WW\docs\issues\43-x.md")"
check "win: su issue en docs"           0 "$(ev "$WW\worktrees\issue-42" "$WW\docs\issues\42-x.md")"
check "win: su carpeta de issue"        0 "$(ev "$WW\worktrees\issue-42" "$WW\docs\contenido\issues\042-x\issue.md")"
check "win: carpeta mayúsculas"         0 "$(ev "$WW\worktrees\issue-42" 'C:\Dev\Org\Docs\Contenido\Issues\042-X\plan.md')"
check "win: carpeta de otro issue"      2 "$(ev "$WW\worktrees\issue-42" "$WW\docs\contenido\issues\043-x\issue.md")"
check "win: _generado"                  2 "$(ev "$WW\worktrees\issue-42" "$WW\docs\contenido\_generado\adr.md")"
check "win: git bash /c/ carpeta"       0 "$(ev "/c/dev/org/worktrees/issue-42" "/c/dev/org/docs/contenido/issues/042-x/issue.md")"

# format.sh nunca bloquea, aunque el archivo no exista o no compile
tmp=$(mktemp -d); printf 'package x\nvar   A = 1\n' > "$tmp/a.go"; printf 'package x\nfunc (\n' > "$tmp/b.go"
for f in "$tmp/a.go" "$tmp/b.go" "$tmp/no-existe.go"; do
  printf '{"tool_input":{"file_path":"%s"}}' "$f" | bash "$HOOKS/format.sh"; rc=$?
  if [ $rc = 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: format.sh exit $rc con $f"; fi
done
if command -v gofmt >/dev/null; then
  if grep -q '^var A = 1$' "$tmp/a.go"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: gofmt no formateó a.go"; fi
fi
rm -rf "$tmp"

echo "hooks: $pass ok, $fail fallidos"
[ $fail = 0 ]
