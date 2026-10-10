/**
 * `test` y `expect` de la suite: SIEMPRE importar desde acá, no desde
 * '@playwright/test', para tener los fixtures:
 *
 *   apiComo(quien)   APIRequestContext contra el gateway como un rol
 *                    ('anonimo' | 'sin-rol' | 'lector' | 'escritor' | 'admin');
 *                    se cierra solo al terminar el test
 *   datos            nombres con el prefijo de la corrida + limpieza por test
 *   ambiente         URLs y prefijo del ambiente elegido (E2E_AMBIENTE)
 *   nuevaApi(quien)  como apiComo pero para beforeAll/afterAll (cerrarlo a mano)
 */
import { test as base, type APIRequestContext } from '@playwright/test';

import { cargarAmbiente, type Ambiente } from './ambiente.ts';
import { cabeceras, type Quien } from './credenciales.ts';
import { Datos } from './datos.ts';

export { expect } from '@playwright/test';
export { HAY_AUTH, ROLES, type Quien, type Rol } from './credenciales.ts';

type NuevaApi = (quien: Quien) => Promise<APIRequestContext>;

interface FixturesTest {
  apiComo: NuevaApi;
  datos: Datos;
}

interface FixturesWorker {
  ambiente: Ambiente;
  nuevaApi: NuevaApi;
}

export const test = base.extend<FixturesTest, FixturesWorker>({
  ambiente: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(cargarAmbiente());
    },
    { scope: 'worker' },
  ],

  nuevaApi: [
    async ({ playwright, ambiente }, use) => {
      await use(async (quien) =>
        playwright.request.newContext({
          baseURL: `${ambiente.apiBaseUrl}/`,
          extraHTTPHeaders: await cabeceras(quien),
        }),
      );
    },
    { scope: 'worker' },
  ],

  apiComo: async ({ nuevaApi }, use) => {
    const abiertos: APIRequestContext[] = [];
    await use(async (quien) => {
      const ctx = await nuevaApi(quien);
      abiertos.push(ctx);
      return ctx;
    });
    await Promise.all(abiertos.map((c) => c.dispose()));
  },

  datos: async ({ ambiente }, use) => {
    const datos = new Datos(ambiente.prefijo);
    await use(datos);
    await datos.limpiar();
  },
});
