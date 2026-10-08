import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { toDomainError } from '@/app/api';
import { ItemsClient } from './items.client';
import type { Item } from './items.contracts';

const PAGE_SIZE = 20;

/**
 * Store de la feature `items`, con signals.
 *
 * - Estado privado en `signal`s; hacia afuera sólo lectura (`asReadonly`) y
 *   `computed`. Los componentes NUNCA escriben estado: llaman métodos.
 * - Se provee a nivel de ruta (ver items.routes.ts): lo comparten lista y
 *   detalle, y se destruye al salir de la feature.
 * - Protección contra respuestas viejas: cada carga incrementa un requestId y
 *   sólo se aplica la respuesta de la última (evita que una búsqueda lenta pise
 *   a una más nueva).
 */
@Injectable()
export class ItemsStore {
  private readonly client = inject(ItemsClient);
  private readonly destroyRef = inject(DestroyRef);

  // ── Lista ────────────────────────────────────────────────────────────────
  private readonly _items = signal<Item[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _nextPageToken = signal('');

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasMore = computed(() => this._nextPageToken() !== '');
  readonly isEmpty = computed(
    () => !this._loading() && this._error() === null && this._items().length === 0,
  );

  // ── Detalle ──────────────────────────────────────────────────────────────
  private readonly _selected = signal<Item | null>(null);
  private readonly _selectedLoading = signal(false);
  private readonly _selectedError = signal<string | null>(null);

  readonly selected = this._selected.asReadonly();
  readonly selectedLoading = this._selectedLoading.asReadonly();
  readonly selectedError = this._selectedError.asReadonly();

  private listRequestId = 0;
  private detailRequestId = 0;

  load(query = ''): void {
    const requestId = ++this.listRequestId;
    this._loading.set(true);
    this._error.set(null);

    this.client
      .list({ query, pageSize: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (requestId !== this.listRequestId) return;
          this._items.set(res.items);
          this._nextPageToken.set(res.nextPageToken ?? '');
          this._loading.set(false);
        },
        error: (err: unknown) => {
          if (requestId !== this.listRequestId) return;
          this._error.set(toDomainError(err).message);
          this._loading.set(false);
        },
      });
  }

  /**
   * Selecciona un item. Si ya está en la lista se muestra al instante y se
   * refresca en segundo plano; si no (entrada directa por URL), se pide.
   */
  select(id: string): void {
    const requestId = ++this.detailRequestId;
    this._selected.set(this._items().find((i) => i.id === id) ?? null);
    this._selectedError.set(null);
    this._selectedLoading.set(true);

    this.client
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          if (requestId !== this.detailRequestId) return;
          this._selected.set(item);
          this._selectedLoading.set(false);
        },
        error: (err: unknown) => {
          if (requestId !== this.detailRequestId) return;
          const error = toDomainError(err);
          if (error.isNotFound()) this._selected.set(null);
          this._selectedError.set(error.message);
          this._selectedLoading.set(false);
        },
      });
  }
}
