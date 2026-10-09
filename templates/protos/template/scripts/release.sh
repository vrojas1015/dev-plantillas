#!/usr/bin/env bash
# Prepara una versión: verifica, actualiza las versiones de los paquetes,
# commitea y crea el tag anotado vX.Y.Z. NO hace push (lo hace una persona).
#
#   make release VERSION=1.2.3
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

VERSION="${1:-}"
VERSION="${VERSION#v}"
TAG="v$VERSION"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "Uso: make release VERSION=X.Y.Z"; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then echo "Hay cambios sin commitear."; exit 1; fi
[[ -z "$(git status --porcelain --untracked-files=normal -- proto gen)" ]] || { echo "Hay archivos sin trackear en proto/ o gen/."; exit 1; }
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then echo "El tag $TAG ya existe."; exit 1; fi

# El código commiteado tiene que corresponder a los .proto.
bash scripts/generate.sh
if [[ -n "$(git status --porcelain -- gen)" ]]; then
  echo "gen/ no estaba al día con proto/. Revisá 'git status gen/', commiteá y reintentá."
  exit 1
fi

bash scripts/version.sh set "$VERSION"
if ! git diff --quiet; then
  git add -A gen
  git commit -q -m "chore(release): $TAG"
fi
git tag -a "$TAG" -m "Release $TAG"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo
echo "Tag $TAG creado sobre $(git rev-parse --short HEAD). Para publicar:"
echo "  git push origin $BRANCH && git push origin $TAG"
