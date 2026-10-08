#!/usr/bin/env bash
# Utilidades compartidas por los hooks. Se cargan con `source`.

# Lee el JSON que Claude Code manda por stdin a la variable HOOK_INPUT.
read_input() { HOOK_INPUT=$(cat); }

# json_get <expresión con puntos>  ej: json_get tool_input.file_path
# Usa jq, node o python, lo que haya (en Windows no siempre hay jq).
json_get() {
  local path=$1
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT" | jq -r ".$path // empty"
  elif command -v node >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v==null?v:v[k];
        if(v!=null)process.stdout.write(String(v));});' "$path"
  else
    local py
    for py in python python3; do
      "$py" -c 'print(1)' >/dev/null 2>&1 && break || py=
    done
    [ -n "$py" ] || return 1
    printf '%s' "$HOOK_INPUT" | "$py" -c '
import json,sys
v=json.load(sys.stdin)
for k in sys.argv[1].split("."):
    v=v.get(k) if isinstance(v,dict) else None
if v is not None: sys.stdout.write(str(v))' "$path"
  fi
}

# Normaliza una ruta para compararla: barras /, unidad en minúscula, sin / final.
#   C:\dev\x  -> c:/dev/x     /c/dev/x -> c:/dev/x
norm_path() {
  local p=${1//\\//}
  if [[ $p =~ ^/([a-zA-Z])/(.*)$ ]]; then p="${BASH_REMATCH[1]}:/${BASH_REMATCH[2]}"; fi
  if [[ $p =~ ^([a-zA-Z]):(.*)$ ]]; then p="${BASH_REMATCH[1],,}:${BASH_REMATCH[2]}"; fi
  printf '%s' "${p%/}"
}

# Sube desde <dir> buscando un archivo; imprime el directorio que lo contiene.
find_up() { # archivo dir
  local d=$2
  while [ -n "$d" ] && [ "$d" != "/" ] && [ "$d" != "." ]; do
    [ -e "$d/$1" ] && { printf '%s' "$d"; return 0; }
    local parent; parent=$(dirname "$d")
    [ "$parent" = "$d" ] && break
    d=$parent
  done
  return 1
}
