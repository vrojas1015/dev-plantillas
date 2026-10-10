#!/bin/sh
# Arranque de la imagen: activa basic auth si están las dos variables.
set -eu
rm -f /etc/caddy/auth.caddy
if [ -n "${DOCS_USUARIO:-}" ] && [ -n "${DOCS_HASH:-}" ]; then
  cp /etc/caddy/auth.caddy.ejemplo /etc/caddy/auth.caddy
  echo "basic auth activado para el usuario $DOCS_USUARIO"
elif [ -n "${DOCS_USUARIO:-}${DOCS_HASH:-}" ]; then
  echo "Falta DOCS_USUARIO o DOCS_HASH: para basic auth hacen falta las dos" >&2
  exit 1
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
