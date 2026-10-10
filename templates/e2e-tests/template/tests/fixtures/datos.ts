/**
 * Datos de prueba: SIEMPRE sintéticos y con el prefijo de la corrida.
 *
 * - Cada test crea lo que necesita (no depende de datos previos ni del orden).
 * - Todo nombre lleva `<prefijo>-` (e2e-<corrida>-...): así se reconoce y se
 *   limpia lo que creó la suite sin tocar nada más del ambiente.
 * - Nunca datos reales ni personales: nada de emails, nombres o documentos de
 *   personas; usar valores obviamente falsos (example.com, "Ítem e2e").
 *
 * Limpieza en dos niveles:
 *   1. Por test: `datos.alLimpiar(fn)` registra cómo borrar lo creado; corre al
 *      terminar el test, pase o falle.
 *   2. Por prefijo: `LIMPIADORES` (abajo) se corre al final de la suite
 *      (globalTeardown) y barre lo que haya quedado con el prefijo de la corrida.
 */
import { randomBytes } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

export class Datos {
  readonly prefijo: string;
  private readonly pendientes: Array<() => Promise<unknown>> = [];

  constructor(prefijo: string) {
    this.prefijo = prefijo;
  }

  /** Nombre único y reconocible: <prefijo>-<base>-<6 hex>. */
  nombre(base: string): string {
    return `${this.prefijo}-${base}-${randomBytes(3).toString('hex')}`;
  }

  /** Registra una limpieza para el final del test (orden inverso al de creación). */
  alLimpiar(fn: () => Promise<unknown>): void {
    this.pendientes.unshift(fn);
  }

  async limpiar(): Promise<void> {
    const errores: unknown[] = [];
    for (const fn of this.pendientes.splice(0)) {
      try {
        await fn();
      } catch (e) {
        errores.push(e);
      }
    }
    if (errores.length) console.warn(`limpieza: ${errores.length} error(es)`, errores);
  }
}

/**
 * Barre un recurso por prefijo con `api` (como admin, contra el gateway).
 * Devuelve cuántos elementos borró (o encontró).
 */
export interface Limpiador {
  recurso: string;
  limpiar: (api: APIRequestContext, prefijo: string) => Promise<number>;
}

/**
 * Un limpiador por recurso que crea la suite. El API de ejemplo (ItemService)
 * no expone DELETE: el limpiador de ítems sólo cuenta los que quedaron. Cuando
 * el API tenga cómo borrar (o un endpoint de administración para QA), hacerlo acá.
 */
export const LIMPIADORES: Limpiador[] = [
  {
    recurso: 'items',
    limpiar: async (api, prefijo) => {
      const res = await api.get('v1/items?page.limit=100');
      if (!res.ok()) return 0;
      const cuerpo = (await res.json()) as { items?: Array<{ name?: string }> };
      return (cuerpo.items ?? []).filter((i) => i.name?.startsWith(prefijo)).length;
    },
  },
];
