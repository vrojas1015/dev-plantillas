/**
 * Prueba las credenciales de un rol: obtiene la credencial y la valida contra el
 * gateway, SIN imprimirla (los tokens no van a la terminal ni a los logs del CI).
 *
 *   npm run token -- <sin-rol|lector|escritor|admin>
 */
import { cargarAmbiente } from '../tests/fixtures/ambiente.ts';
import { CABECERA, credencial, HAY_AUTH, ROLES, type Rol } from '../tests/fixtures/credenciales.ts';

const rol = process.argv[2] as Rol | undefined;
if (!rol || !ROLES.includes(rol)) {
  console.error(`uso: npm run token -- <${ROLES.join('|')}>`);
  process.exit(2);
}
if (!HAY_AUTH) {
  console.log('auth = ninguno: no hay credenciales que probar');
  process.exit(0);
}
const amb = cargarAmbiente();
const valor = await credencial(rol);
const partes = valor.replace(/^Bearer /, '').split('.');
console.log(`${rol}: credencial obtenida (${CABECERA}, ${valor.length} caracteres)`);
if (partes.length === 3 && partes[1]) {
  const claims = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  const { sub, iss, aud, exp } = claims;
  console.log({ sub, iss, aud, exp: typeof exp === 'number' ? new Date(exp * 1000).toISOString() : exp });
}
const res = await fetch(`${amb.apiBaseUrl}/v1/items`, { headers: { [CABECERA]: valor } });
console.log(`GET ${amb.apiBaseUrl}/v1/items -> ${res.status}`);
