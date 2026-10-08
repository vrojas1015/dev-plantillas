#!/usr/bin/env bash
# =============================================================================
# Init de Postgres para docker-compose.yml (desarrollo local)
# =============================================================================
# La imagen oficial de postgres ejecuta /docker-entrypoint-initdb.d/* SOLO
# cuando inicializa un volumen vacío. Este script aplica migrations/*.up.sql
# (montadas en /migrations) en orden. No se monta la carpeta directamente en
# initdb.d porque correría también los .down.sql (y en orden alfabético el
# down de cada migración va antes que su up).
#
# Si el archivo no tiene bit de ejecución, el entrypoint de postgres lo hace
# `source` en vez de ejecutarlo: por eso no usa `exit` ni `set -e` propios
# (el entrypoint ya corre con errexit y psql corta con ON_ERROR_STOP).
# =============================================================================

compose_initdb() {
  local f found=0
  for f in /migrations/*.up.sql; do
    [ -e "$f" ] || continue
    found=1
    echo "compose-initdb: aplicando $(basename "$f")"
    psql -v ON_ERROR_STOP=1 -X -q --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f" || return 1
  done
  [ "$found" -eq 1 ] || echo "compose-initdb: no hay migraciones en /migrations"
}

compose_initdb
