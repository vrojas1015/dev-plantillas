// Servidor MÍNIMO para el job `e2e-tests` de templates.yml: imita lo que la
// suite generada espera del api-gateway de ejemplo (ItemService por REST) sin
// levantar protos + servicio + Postgres + gateway. No es parte de ninguna
// plantilla. El E2E completo con las plantillas reales se hace a mano (README
// de templates/e2e-tests, "Verificar cambios en la plantilla").
//
//   node servidor-prueba.mjs <api.swagger.json>     (PORT, default 8080)
//
// Auth (como el gateway): Bearer con un token del "IdP" de abajo (OIDC con
// grant password, o el login de Firebase vía FIREBASE_AUTH_EMULATOR_HOST;
// tokens sin firmar, sólo para la prueba) o X-API-Key. SIN_AUTH=1: todas las
// rutas públicas (auth = ninguno).
// Rutas: GET /v1/items pública (rate limit por IP: ráfaga 100, 10/s -> 429 +
// Retry-After), GET /v1/items/{id} items.read|items.admin, POST /v1/items
// items.write|items.admin; resto 404. Errores {"error":{code,message,request_id}}.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const SIN_AUTH = process.env.SIN_AUTH === '1';
const swagger = readFileSync(process.argv[2], 'utf8');

const USUARIOS = {
  // Firebase usa el email como usuario.
  'e2e-sin-rol@example.com': { clave: 'clave-sin-rol', roles: [] },
  'e2e-lector@example.com': { clave: 'clave-lector', roles: ['items.read'] },
  'e2e-escritor@example.com': { clave: 'clave-escritor', roles: ['items.read', 'items.write'] },
  'e2e-admin@example.com': { clave: 'clave-admin', roles: ['items.admin'] },
  'e2e-sin-rol': { clave: 'clave-sin-rol', roles: [] },
  'e2e-lector': { clave: 'clave-lector', roles: ['items.read'] },
  'e2e-escritor': { clave: 'clave-escritor', roles: ['items.read', 'items.write'] },
  'e2e-admin': { clave: 'clave-admin', roles: ['items.admin'] },
};
const API_KEYS = {
  'key-sin-rol': [],
  'key-lector': ['items.read'],
  'key-escritor': ['items.read', 'items.write'],
  'key-admin': ['items.admin'],
};

const items = [];
const buckets = new Map();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function responder(res, status, cuerpo, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': randomUUID().replaceAll('-', ''),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
}

function error(res, status, code, message, extra) {
  responder(res, status, { error: { code, message, request_id: randomUUID().replaceAll('-', '') } }, extra);
}

/** Roles de la credencial; null = sin credencial o inválida. */
function roles(req) {
  const key = req.headers['x-api-key'];
  if (key) return API_KEYS[key] ?? null;
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  if (!m) return null;
  try {
    const payload = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8'));
    return USUARIOS[payload.sub] ? USUARIOS[payload.sub].roles : null;
  } catch {
    return null;
  }
}

function autorizar(req, res, permitidos) {
  if (SIN_AUTH) return true;
  const r = roles(req);
  if (r === null) return error(res, 401, 'UNAUTHENTICATED', 'credencial ausente o inválida'), false;
  if (!r.some((x) => permitidos.includes(x))) return error(res, 403, 'PERMISSION_DENIED', 'sin permiso'), false;
  return true;
}

function limitar(req, res) {
  const ip = req.socket.remoteAddress ?? '?';
  const ahora = Date.now() / 1000;
  const b = buckets.get(ip) ?? { tokens: 100, t: ahora };
  b.tokens = Math.min(100, b.tokens + (ahora - b.t) * 10);
  b.t = ahora;
  buckets.set(ip, b);
  if (b.tokens < 1) return error(res, 429, 'RESOURCE_EXHAUSTED', 'demasiados requests', { 'Retry-After': '1' }), false;
  b.tokens -= 1;
  return true;
}

function leerCuerpo(req) {
  return new Promise((ok) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => ok(datos));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === 'GET' && p === '/.well-known/openid-configuration') {
    return responder(res, 200, { issuer: `http://localhost:${PORT}`, token_endpoint: `http://localhost:${PORT}/oauth/token` });
  }
  if (req.method === 'POST' && p === '/oauth/token') {
    const form = new URLSearchParams(await leerCuerpo(req));
    const u = USUARIOS[form.get('username')];
    if (form.get('grant_type') !== 'password' || form.get('client_id') !== 'e2e-tests' || !u || u.clave !== form.get('password')) {
      return responder(res, 401, { error: 'invalid_grant' });
    }
    const tok = `${b64({ alg: 'none' })}.${b64({ sub: form.get('username'), iss: 'prueba', aud: 'api-gateway', exp: Math.floor(Date.now() / 1000) + 1800 })}.x`;
    return responder(res, 200, { access_token: tok, id_token: tok, token_type: 'Bearer', expires_in: 1800 });
  }
  if (req.method === 'POST' && p === '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword') {
    const cuerpo = JSON.parse((await leerCuerpo(req)) || '{}');
    const u = USUARIOS[cuerpo.email];
    if (!url.searchParams.get('key') || !u || u.clave !== cuerpo.password) return error(res, 400, 'INVALID_LOGIN_CREDENTIALS', 'login');
    return responder(res, 200, { idToken: `${b64({ alg: 'none' })}.${b64({ sub: cuerpo.email })}.x`, expiresIn: '3600' });
  }
  if (req.method === 'GET' && p === '/openapi.json') return responder(res, 200, swagger);

  if (p === '/v1/items' && req.method === 'GET') {
    if (!limitar(req, res)) return;
    const limite = url.searchParams.get('page.limit');
    if (limite !== null && !/^-?\d+$/.test(limite)) return error(res, 400, 'INVALID_ARGUMENT', 'page.limit inválido');
    const n = limite === null || Number(limite) <= 0 ? 50 : Math.min(Number(limite), 100);
    return responder(res, 200, { items: items.slice(-n).reverse(), page: { nextCursor: '', hasNext: false } });
  }
  if (p === '/v1/items' && req.method === 'POST') {
    if (!autorizar(req, res, ['items.write', 'items.admin'])) return;
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return error(res, 415, 'UNSUPPORTED', 'Content-Type');
    let cuerpo;
    try {
      cuerpo = JSON.parse((await leerCuerpo(req)) || '{}');
    } catch {
      return error(res, 400, 'INVALID_ARGUMENT', 'JSON inválido');
    }
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo) || Object.keys(cuerpo).some((k) => !['name', 'description'].includes(k))) {
      return error(res, 400, 'INVALID_ARGUMENT', 'campos inválidos');
    }
    const { name, description = '' } = cuerpo;
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof description !== 'string') {
      return error(res, 400, 'INVALID_ARGUMENT', 'name inválido');
    }
    if (items.some((i) => i.name === name)) return error(res, 409, 'ALREADY_EXISTS', 'ya existe');
    const ahora = new Date().toISOString();
    const item = { id: randomUUID(), name, description, createdAt: ahora, updatedAt: ahora };
    items.push(item);
    return responder(res, 200, { item });
  }
  const m = /^\/v1\/items\/([^/]+)$/.exec(p);
  if (m && req.method === 'GET') {
    if (!autorizar(req, res, ['items.read', 'items.admin'])) return;
    if (!/^[0-9a-f-]{36}$/i.test(m[1])) return error(res, 400, 'INVALID_ARGUMENT', 'id inválido');
    const item = items.find((i) => i.id === m[1]);
    return item ? responder(res, 200, { item }) : error(res, 404, 'NOT_FOUND', 'no encontrado');
  }
  return error(res, 404, 'NOT_FOUND', 'ruta no encontrada');
}).listen(PORT, () => console.log(`servidor de prueba en :${PORT}`));
