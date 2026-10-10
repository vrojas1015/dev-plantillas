/**
 * globalTeardown de Playwright: barre por prefijo lo que haya quedado de esta
 * corrida (ver LIMPIADORES en datos.ts), como admin. Nunca hace fallar la suite.
 *
 * Usa el APIRequestContext de Playwright y no fetch(): en Windows, sockets
 * keep-alive de fetch abiertos al salir hacen abortar el proceso de Node.
 */
import { request } from '@playwright/test';

import { cargarAmbiente } from './ambiente.ts';
import { cabeceras } from './credenciales.ts';
import { LIMPIADORES } from './datos.ts';

export default async function limpiezaGlobal(): Promise<void> {
  const { apiBaseUrl, prefijo } = cargarAmbiente();
  let api;
  try {
    api = await request.newContext({ baseURL: `${apiBaseUrl}/`, extraHTTPHeaders: await cabeceras('admin') });
  } catch (e) {
    console.warn(`limpieza: sin credencial de admin, no se limpia (${String(e)})`);
    return;
  }
  for (const l of LIMPIADORES) {
    try {
      const n = await l.limpiar(api, prefijo);
      if (n) console.log(`limpieza: ${l.recurso}: ${n} con prefijo ${prefijo}`);
    } catch (e) {
      console.warn(`limpieza: ${l.recurso}: ${String(e)}`);
    }
  }
  await api.dispose();
}
