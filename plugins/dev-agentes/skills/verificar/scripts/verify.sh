#!/usr/bin/env bash
# Verifica uno o varios proyectos según su stack y deja un resumen parseable.
#
#   verify.sh [dir ...]
#
# Sin argumentos: si el directorio actual es un proyecto, verifica ése; si no,
# verifica cada subdirectorio inmediato que lo sea (caso worktrees/issue-<n>/).
#
# Stacks: Go (go.mod), Node (package.json), Python (pyproject.toml o
# requirements.txt). Cada paso imprime una línea:
#
#   RESULT <PASS|FAIL|SKIP> <proyecto> <paso> <segundos>s [motivo]
#
# y, si falla, las últimas líneas de su salida. Sale con 1 si algún paso falló.
set -uo pipefail

LOG_DIR=$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/verify.$$")
mkdir -p "$LOG_DIR"
failed=0

is_project() { [ -f "$1/go.mod" ] || [ -f "$1/package.json" ] || [ -f "$1/pyproject.toml" ] || [ -f "$1/requirements.txt" ]; }

result() { # estado proyecto paso segundos [motivo]
  printf 'RESULT %s %s %s %ss%s\n' "$1" "$2" "$3" "$4" "${5:+ $5}"
}

run_step() { # proyecto dir paso comando...
  local name=$1 dir=$2 step=$3; shift 3
  local log="$LOG_DIR/$name.$step.log" start=$SECONDS
  if (cd "$dir" && "$@") >"$log" 2>&1; then
    result PASS "$name" "$step" $((SECONDS - start))
  else
    result FAIL "$name" "$step" $((SECONDS - start))
    echo "----- últimas líneas de $step ($log) -----"
    tail -n 25 "$log"
    echo "-----"
    failed=1
  fi
}

gofmt_clean() {
  local out
  out=$(gofmt -l . 2>&1) || { echo "$out"; return 1; }   # error de sintaxis
  [ -z "$out" ] || { echo "Archivos sin formato:"; echo "$out"; return 1; }
}

has_script() { # dir script
  (cd "$1" && node -e "process.exit(require('./package.json').scripts?.['$2'] ? 0 : 1)") 2>/dev/null
}

verify_go() {
  local name=$1 dir=$2
  command -v go >/dev/null || { result SKIP "$name" go 0 "go no está instalado"; return; }
  run_step "$name" "$dir" build go build ./...
  run_step "$name" "$dir" vet   go vet ./...
  run_step "$name" "$dir" test  go test -count=1 ./...
  command -v gofmt >/dev/null && run_step "$name" "$dir" gofmt gofmt_clean
}

verify_node() {
  local name=$1 dir=$2
  command -v npm >/dev/null || { result SKIP "$name" node 0 "npm no está instalado"; return; }
  if [ ! -d "$dir/node_modules" ]; then
    result SKIP "$name" node 0 "faltan dependencias: correr 'npm ci' en $dir"
    return
  fi
  has_script "$dir" lint && run_step "$name" "$dir" lint npm run --silent lint
  if has_script "$dir" test:unit; then
    run_step "$name" "$dir" test npm run --silent test:unit
  elif has_script "$dir" test; then
    run_step "$name" "$dir" test npm run --silent test -- --watch=false
  fi
  has_script "$dir" build && run_step "$name" "$dir" build npm run --silent build
}

verify_python() {
  local name=$1 dir=$2 py
  py=$(command -v python3 || command -v python) || { result SKIP "$name" python 0 "python no está instalado"; return; }
  if (cd "$dir" && "$py" -m ruff --version) >/dev/null 2>&1; then
    run_step "$name" "$dir" lint "$py" -m ruff check .
  fi
  if (cd "$dir" && "$py" -m pytest --version) >/dev/null 2>&1; then
    run_step "$name" "$dir" test "$py" -m pytest -q
  else
    result SKIP "$name" test 0 "pytest no está disponible"
  fi
}

verify_dir() {
  local dir=$1 name; name=$(basename "$(cd "$dir" && pwd)")
  [ -f "$dir/go.mod" ] && verify_go "$name" "$dir"
  [ -f "$dir/package.json" ] && verify_node "$name" "$dir"
  { [ -f "$dir/pyproject.toml" ] || [ -f "$dir/requirements.txt" ]; } && verify_python "$name" "$dir"
}

targets=()
if [ $# -gt 0 ]; then
  targets=("$@")
elif is_project .; then
  targets=(.)
else
  for d in */; do is_project "$d" && targets+=("${d%/}"); done
fi

if [ ${#targets[@]} -eq 0 ]; then
  echo "No se encontró ningún proyecto (go.mod, package.json, pyproject.toml, requirements.txt) en $(pwd) ni en sus subdirectorios inmediatos."
  exit 2
fi

for t in "${targets[@]}"; do
  if is_project "$t"; then verify_dir "$t"; else echo "Ignorado: $t no es un proyecto reconocido"; fi
done

echo "Logs completos: $LOG_DIR"
exit $failed
