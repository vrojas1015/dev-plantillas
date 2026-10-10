/**
 * Smoke: lo desplegado responde y con los controles comunes del gateway. Corre
 * en todos los ambientes (en prod, sólo los @smoke).
 */
import { existsSync } from 'node:fs';

import { expect, test } from '../fixtures/index.ts';

test.describe('smoke del gateway', { tag: ['@smoke'] }, () => {
  test('el listado público responde con cabeceras de seguridad y request-id', async ({ apiComo }) => {
    const res = await (await apiComo('anonimo')).get('v1/items');
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h['x-request-id']).toBeTruthy();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-type']).toContain('application/json');
  });

  test('una ruta no declarada no existe (404)', async ({ apiComo }) => {
    const res = await (await apiComo('anonimo')).get('v1/ruta-que-no-existe-e2e');
    expect(res.status()).toBe(404);
  });

  test('el OpenAPI del gateway está disponible', async ({ ambiente, apiComo }) => {
    if (!/^https?:\/\//.test(ambiente.openapi)) {
      expect(existsSync(ambiente.openapi), ambiente.openapi).toBe(true);
      return;
    }
    test.skip(ambiente.esProd, 'en prod el OpenAPI suele estar apagado (OPENAPI_ENABLED=false)');
    const res = await (await apiComo('anonimo')).get(ambiente.openapi);
    expect(res.status()).toBe(200);
    expect(Object.keys(((await res.json()) as { paths?: object }).paths ?? {})).not.toHaveLength(0);
  });
});
