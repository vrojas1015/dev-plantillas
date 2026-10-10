#!/bin/sh
# Valida el título de un MR/PR (es el mensaje que queda en main al hacer squash).
# Formato: Conventional Commits con el issue en el scope.
#
#   feat(issue-42): tope de descuento por pedido
#   fix(issue-7)!: el total ya no incluye el envío
#
# Excepción: actualizaciones de dependencias, sin issue (chore(deps): …,
# chore(deps-dev): …). Los prefijos de borrador (Draft:, WIP:) se ignoran.
#
# Uso: sh scripts/verificar-titulo.sh "<título>"   (lo corre el CI; base común
# de dev-plantillas: no editar acá, se actualiza con `copier update`).
set -eu

titulo=${1-}
tipos='feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert'

# Borradores: GitLab antepone "Draft:" (o "[Draft]", "(Draft)"); algunos "WIP:".
for prefijo in 'Draft:' 'draft:' '[Draft]' '(Draft)' 'WIP:' '[WIP]'; do
  case $titulo in
    "$prefijo"*) titulo=${titulo#"$prefijo"}; titulo=${titulo# } ;;
  esac
done

if printf '%s\n' "$titulo" | grep -Eq "^chore\\(deps(-dev)?\\)!?: [^ ]"; then
  echo "Título OK (dependencias): $titulo"
  exit 0
fi

if printf '%s\n' "$titulo" | grep -Eq "^($tipos)\\(([^()]*[,/ ])?issue-[0-9]+([,/ ][^()]*)?\\)!?: [^ ]"; then
  echo "Título OK: $titulo"
  exit 0
fi

cat >&2 <<EOF
Título inválido: "$titulo"

Formato esperado (Conventional Commits con el número de issue en el scope):
  <tipo>(issue-<n>): <descripción>
  tipo: feat, fix, docs, style, refactor, perf, test, build, ci, chore o revert
  ej.:  feat(issue-42): tope de descuento por pedido

Sólo las actualizaciones de dependencias van sin issue: chore(deps): …
Corregí el título del MR/PR y volvé a correr el job.
EOF
exit 1
