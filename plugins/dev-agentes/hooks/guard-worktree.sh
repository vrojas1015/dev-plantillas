#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): si la sesión trabaja en
# <workspace>/worktrees/issue-<n>/, bloquea las ediciones a otros archivos del
# workspace (copias principales de los repos, worktrees de otros issues).
#
# Permitido:
#   - todo dentro de worktrees/issue-<n>/
#   - el archivo del propio issue: <workspace>/docs/issues/<n>-*.md
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
issues_dir="$(lc "$workspace")/docs/issues/"
if [[ $f == "$issues_dir"* ]]; then                                # su issue
  rest=${f#"$issues_dir"}
  [[ $rest != */* && $rest =~ ^0*${issue}-.+\.md$ ]] && exit 0
fi

cat >&2 <<EOF
Bloqueado por dev-agentes: esta sesión trabaja en el issue $issue y sólo puede
editar dentro de $issue_dir (y su archivo en docs/issues/).

Intentaste editar: $file

- Si es otro repo del mismo issue, creá su worktree:
    git -C <repo> worktree add --no-track $issue_dir/<repo> -b feat/issue-$issue-<slug> origin/main
- Si es trabajo de otro issue, va en otra sesión.
- Si es intencional, el usuario puede relanzar con DEV_AGENTES_ALLOW_OUTSIDE=1.
EOF
exit 2
