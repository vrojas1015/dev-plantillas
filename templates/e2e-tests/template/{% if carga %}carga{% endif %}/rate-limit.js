// k6: verifica que el rate limit del gateway responde 429 con Retry-After.
// Una ráfaga de RATE_LIMIT_REQUESTS (default 300) contra RATE_LIMIT_RUTA
// (default v1/items, pública: el bucket es por IP) por encima del burst
// configurado (100 en el gateway de ejemplo). Falla si:
//   - no hubo ningún 429 (el rate limit no está activo o el burst es mayor)
//   - algún 429 vino sin Retry-After
//   - alguna respuesta no fue 200 ni 429 (p. ej. un 5xx bajo ráfaga)
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.API_BASE_URL;
const RUTA = __ENV.RATE_LIMIT_RUTA || 'v1/items';
const respuestas429 = new Counter('respuestas_429');

export const options = {
  scenarios: {
    rafaga: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: Number(__ENV.RATE_LIMIT_REQUESTS || 300),
      maxDuration: '60s',
    },
  },
  thresholds: {
    respuestas_429: ['count>0'],
    'checks{chequeo:retry-after}': ['rate==1'],
    http_req_failed: ['rate==0'],
  },
};

export default function () {
  const res = http.get(`${BASE}/${RUTA}`, {
    responseCallback: http.expectedStatuses(200, 429),
  });
  if (res.status === 429) {
    respuestas429.add(1);
    check(res, { '429 con Retry-After': (r) => !!r.headers['Retry-After'] }, { chequeo: 'retry-after' });
  }
}
