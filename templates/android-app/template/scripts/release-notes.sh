#!/usr/bin/env bash
# release-notes.sh X.Y.Z: copia la sección "## [X.Y.Z]" de CHANGELOG.md a las
# notas de la versión de Google Play (app/src/main/play/release-notes/es-419/default.txt).
# Play acepta hasta 500 caracteres. Lo corre el CI antes de publicar.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

version="${1:?Uso: scripts/release-notes.sh X.Y.Z}"
out=app/src/main/play/release-notes/es-419/default.txt

notes="$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found && NF { print }
' CHANGELOG.md)"

if [[ -z "$notes" ]]; then
  echo "CHANGELOG.md no tiene la sección ## [$version] (o está vacía)" >&2
  exit 1
fi
if (( ${#notes} > 500 )); then
  echo "Las notas de $version tienen ${#notes} caracteres; Play acepta 500. Resumilas en CHANGELOG.md." >&2
  exit 1
fi
mkdir -p "$(dirname "$out")"
printf '%s\n' "$notes" > "$out"
echo "Notas de $version -> $out"
