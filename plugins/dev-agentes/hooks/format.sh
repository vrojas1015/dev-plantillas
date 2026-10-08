#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): formatea el archivo recién editado con la
# herramienta del proyecto, si está disponible. Nunca bloquea: si el formateador
# falta o falla (p. ej. el archivo todavía no compila), no hace nada.
#
#   .go                          -> gofmt -w
#   .ts .js .mjs .html .scss .css .json -> prettier del proyecto (node_modules/.bin), respeta .prettierignore
#   .py                          -> ruff format (si está instalado)
#
# Desactivar: DEV_AGENTES_NO_FORMAT=1
set -uo pipefail
source "$(dirname "$0")/lib.sh"

[ "${DEV_AGENTES_NO_FORMAT:-}" = 1 ] && exit 0
read_input
file=$(json_get tool_input.file_path)
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "${file,,}" in
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$file" >/dev/null 2>&1
    ;;
  *.ts|*.js|*.mjs|*.html|*.scss|*.css|*.json)
    root=$(find_up package.json "$(dirname "$file")") || exit 0
    bin="$root/node_modules/.bin/prettier"
    [ -x "$bin" ] || [ -f "$bin.cmd" ] || exit 0
    # Desde la raíz del proyecto para que tome .prettierrc y .prettierignore.
    (cd "$root" && "$bin" --write --log-level silent "$file") >/dev/null 2>&1
    ;;
  *.py)
    if command -v ruff >/dev/null 2>&1; then ruff format --quiet "$file" >/dev/null 2>&1; fi
    ;;
esac
exit 0
