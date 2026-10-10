#!/usr/bin/env bash
# verificar.sh <proyecto> <auth>: corre la suite api de un proyecto generado con
# la plantilla e2e-tests contra servidor-prueba.mjs (ya levantado en
# API_BASE_URL) y verifica lo que promete la plantilla:
#   1. la suite pasa (autorización por rol, flujo, smoke) y registro.json cumple
#      su esquema, con los escenarios del ejemplo en ✅;
#   2. un test @inestable que falla NO bloquea y queda ⚠️ en el registro;
#   3. un test normal que falla SÍ bloquea (registro.ts --bloquear sale 1).
# Lo usa el job e2e-tests de templates.yml; también sirve local (Git Bash).
set -euo pipefail
proyecto=$1
auth=$2
aqui=$(cd "$(dirname "$0")" && pwd)
cd "$proyecto"

case "$auth" in
  oidc)
    export OIDC_ISSUER="$API_BASE_URL" OIDC_CLIENT_ID=e2e-tests
    for r in SIN_ROL LECTOR ESCRITOR ADMIN; do
      u=$(echo "e2e-$r" | tr 'A-Z_' 'a-z-')
      export "E2E_${r}_USUARIO=$u" "E2E_${r}_CLAVE=clave-${u#e2e-}"
    done ;;
  firebase)
    export FIREBASE_API_KEY=clave-web-de-prueba FIREBASE_AUTH_EMULATOR_HOST="${API_BASE_URL#http://}"
    for r in SIN_ROL LECTOR ESCRITOR ADMIN; do
      u=$(echo "e2e-$r" | tr 'A-Z_' 'a-z-')
      export "E2E_${r}_USUARIO=$u@example.com" "E2E_${r}_CLAVE=clave-${u#e2e-}"
    done ;;
  api-key)
    for r in SIN_ROL LECTOR ESCRITOR ADMIN; do
      export "E2E_${r}_API_KEY=key-$(echo "$r" | tr 'A-Z_' 'a-z-')"
    done ;;
  ninguno) ;;
esac

echo "== 1. suite api + @inestable que falla (no bloquea)"
cat > tests/api/cuarentena-ci.spec.ts <<'EOF'
import { expect, test } from '../fixtures/index.ts';

test('en cuarentena y falla', { tag: ['@inestable', '@CU-001-4'] }, async ({ apiComo }) => {
  const res = await (await apiComo('anonimo')).get('v1/items');
  expect(res.status(), 'falla a propósito').toBe(418);
});
EOF
npm run e2e -- --project='api*'

python -X utf8 - "$aqui/../../templates/e2e-tests/template/esquemas/registro.schema.json" "$auth" <<'PY'
import json, sys
import jsonschema
esquema = json.load(open(sys.argv[1], encoding="utf-8"))
reg = json.load(open("reportes/registro.json", encoding="utf-8"))
jsonschema.Draft202012Validator(esquema, format_checker=jsonschema.FormatChecker()).validate(reg)
esc = reg["escenarios"]
esperados = {"CU-001-1": "pasa", "CU-001-4": "inestable"}
if sys.argv[2] != "ninguno":
    esperados["CU-001-2"] = "pasa"
for k, v in esperados.items():
    assert esc[k]["estado"] == v, (k, esc[k]["estado"])
assert any(t["proyecto"] == "api-inestable" for t in esc["CU-001-4"]["tests"])
print("registro.json: esquema OK;", {k: esc[k]["icono"] for k in sorted(esc)})
PY

echo "== 2. un test normal que falla bloquea"
sed "s/'@inestable', //; s/en cuarentena y falla/falla sin cuarentena/" tests/api/cuarentena-ci.spec.ts > tests/api/rojo-ci.spec.ts
if npm run e2e -- --project='api*'; then
  echo "ERROR: un test rojo sin @inestable no bloqueó"; exit 1
fi
echo "bloqueó, como corresponde"
rm tests/api/cuarentena-ci.spec.ts tests/api/rojo-ci.spec.ts
