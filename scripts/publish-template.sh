#!/usr/bin/env bash
# Publica una plantilla de templates/<nombre> en su propio repo y la taggea.
# Copier sólo versiona (y permite `copier update`) si la plantilla está en la
# raíz de un repo; por eso se desarrollan acá juntas y se publican separadas.
#
#   scripts/publish-template.sh go-grpc-service v1.0.0 git@gitlab.com:<org>/platform/template-go-grpc-service.git
set -euo pipefail
name=$1; version=$2; remote=$3
root=$(git rev-parse --show-toplevel)
src="$root/templates/$name"
[ -f "$src/copier.yml" ] || { echo "No existe $src/copier.yml"; exit 1; }
[ -z "$(git -C "$root" status --porcelain -- "templates/$name")" ] || { echo "Hay cambios sin commitear en templates/$name"; exit 1; }

# subtree split: historial sólo de esa carpeta, con la carpeta como raíz
branch="publish/$name"
git -C "$root" subtree split --prefix="templates/$name" -b "$branch" >/dev/null
git -C "$root" push "$remote" "$branch:main"
git -C "$root" tag -f "$name-$version" "$branch"
git -C "$root" push "$remote" "$name-$version:refs/tags/$version"
git -C "$root" branch -D "$branch" >/dev/null
echo "Publicado $name $version en $remote"
