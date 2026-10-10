/**
 * Page Object de la lista de ítems (front generado con la plantilla angular-app).
 *
 * Los tests hablan con la página SÓLO a través de Page Objects: si cambia el
 * markup, se cambia acá y no en cada test. Preferir roles y textos accesibles
 * (getByRole, getByText) y, si no alcanza, las clases BEM del componente.
 */
import type { Locator, Page } from '@playwright/test';

export class ItemsPagina {
  readonly page: Page;
  readonly titulo: Locator;
  readonly filas: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titulo = page.getByRole('heading', { level: 1 });
    this.filas = page.locator('.item-list__row');
    this.error = page.getByRole('alert');
  }

  async abrir(): Promise<void> {
    await this.page.goto('items');
  }

  /** La fila de un ítem por su nombre (los nombres e2e son únicos por el prefijo). */
  fila(nombre: string): Locator {
    return this.filas.filter({ hasText: nombre });
  }
}
