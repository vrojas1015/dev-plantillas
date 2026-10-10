#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): si la sesión trabaja en
# <workspace>/worktrees/issue-<n>/, bloquea las ediciones a otros archivos del
# workspace (copias principales de los repos, worktrees de otros issues).
#
# Permitido:
#   - todo dentro de worktrees/issue-<n>/
#   - la carpeta del propio issue en el repo de documentación (plantilla docs):
#     <workspace>/docs/contenido/issues/<n>-*/**  (con o sin ceros a la izquierda)
#   - el archivo del propio issue en el formato anterior: <workspace>/docs/issues/<n>-*.md
#   - todo lo que esté fuera del workspace (temporales, memoria, ~/.claude)
# Fuera de un worktree de issue no hace nada.
#
# Escape consciente: DEV_AGENTES_ALLOW_OUTSIDE=1 en el entorno de la sesión.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

[ "${DEV_AGENTES_ALLOW_OUTSIDE:-}" = 1 ] && exit 0
read_input

cwd=$(norm_path "$(json_get cwd)")
file=$(json_get tool_input.file_path)
[ -z "$file" ] && file=$(json_get tool_input.notebook_path)
[ -z "$file" ] && exit 0

# ¿La sesión está dentro de un worktree de issue?
[[ $cwd =~ ^(.*)/worktrees/issue-([0-9]+)(/|$) ]] || exit 0
workspace=${BASH_REMATCH[1]}
issue=${BASH_REMATCH[2]}
issue_dir="$workspace/worktrees/issue-$issue"

# Rutas relativas se resuelven contra el cwd de la sesión.
file=$(norm_path "$file")
[[ $file =~ ^[a-z]:/ || $file == /* ]] || file="$cwd/$file"

lc() { printf '%s' "${1,,}"; }   # Windows no distingue mayúsculas
f=$(lc "$file")

[[ $f == "$(lc "$issue_dir")"/* ]] && exit 0                      # dentro del issue
[[ $f == "$(lc "$workspace")"/* ]] || exit 0                      # fuera del workspace
# Nada de `..` ni `.` como segmento: no se resuelven y permitirían salir de la carpeta.
if [[ $f != */../* && $f != */./* && $f != */.. && $f != */. ]]; then
  docs="$(lc "$workspace")/docs"
  # Carpeta del issue (plantilla docs): contenido/issues/<n>-<slug>/<cualquier archivo>
  dir_new="$docs/contenido/issues/"
  if [[ $f == "$dir_new"* ]]; then
    rest=${f#"$dir_new"}
    [[ $rest =~ ^0*${issue}-[^/]+/.+$ ]] && exit 0
  fi
  # Formato anterior: un archivo por issue en docs/issues/<n>-<slug>.md
  dir_old="$docs/issues/"
  if [[ $f == "$dir_old"* ]]; then
    rest=${f#"$dir_old"}
    [[ $rest != */* && $rest =~ ^0*${issue}-.+\.md$ ]] && exit 0
  fi
fi

cat >&2 <<EOF
Bloqueado por dev-agentes: esta sesión trabaja en el issue $issue y sólo puede
editar dentro de $issue_dir y la carpeta de su issue en
docs/contenido/issues/ (o su archivo en docs/issues/). Nunca otros issues ni _generado/.

Intentaste editar: $file

- Si es otro repo del mismo issue, creá su worktree:
    git -C <repo> worktree add --no-track $issue_dir/<repo> -b feat/issue-$issue-<slug> origin/main
- Si es trabajo de otro issue, va en otra sesión.
- Si es intencional, el usuario puede relanzar con DEV_AGENTES_ALLOW_OUTSIDE=1.
EOF
exit 2
