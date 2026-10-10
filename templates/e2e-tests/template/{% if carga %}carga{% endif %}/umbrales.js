// k6: carga de lectura con umbrales. Falla (exit 99) si se supera alguno:
//   p95 de http_req_duration < CARGA_P95_MS (default 500 ms)
//   tasa de errores (http_req_failed) < CARGA_ERRORES (default 0.01 = 1 %)
// Lo corre carga/carga.ts (npm run carga); variables en docs/carga.md.
//
// Ojo con el rate limit del gateway: el tráfico de UN usuario por encima de su
// límite (600/min en el gateway de ejemplo) termina en 429 = errores. Para
// medir más alto, varios usuarios de prueba o un límite propio para QA.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.API_BASE_URL;
const CABECERA = __ENV.E2E_CABECERA;
const CREDENCIAL = __ENV.E2E_CREDENCIAL;

export const options = {
  scenarios: {
    lectura: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.CARGA_RPS || 5),
      timeUnit: '1s',
      duration: __ENV.CARGA_DURACION || '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${Number(__ENV.CARGA_P95_MS || 500)}`],
    http_req_failed: [`rate<${Number(__ENV.CARGA_ERRORES || 0.01)}`],
  },
};

export default function () {
  const headers = CREDENCIAL ? { [CABECERA]: CREDENCIAL } : {};
  const res = http.get(`${BASE}/v1/items?page.limit=20`, { headers, tags: { ruta: 'GET /v1/items' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
