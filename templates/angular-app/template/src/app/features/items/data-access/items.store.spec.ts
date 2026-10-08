import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/app/api';
import { ItemsClient } from './items.client';
import type { Item, ListItemsResponse } from './items.contracts';
import { ItemsStore } from './items.store';

const item = (id: string, name = `Item ${id}`): Item => ({
  id,
  name,
  description: '',
  status: 'active',
  updatedAt: '2026-01-01T00:00:00Z',
});

const page = (...items: Item[]): ListItemsResponse => ({ items, nextPageToken: '' });

describe('ItemsStore', () => {
  let client: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let store: ItemsStore;

  beforeEach(() => {
    client = { list: vi.fn(), get: vi.fn() };
    TestBed.configureTestingModule({
      providers: [ItemsStore, { provide: ItemsClient, useValue: client }],
    });
    store = TestBed.inject(ItemsStore);
  });

  it('carga la lista y baja el loading', () => {
    client.list.mockReturnValue(of(page(item('1'), item('2'))));

    store.load();

    expect(store.items().map((i) => i.id)).toEqual(['1', '2']);
    expect(store.loading()).toBe(false);
    expect(store.isEmpty()).toBe(false);
  });

  it('expone el mensaje de error del API', () => {
    client.list.mockReturnValue(
      throwError(
        () => new DomainError({ status: 500, message: 'Falló', details: [], traceId: null }),
      ),
    );

    store.load();

    expect(store.error()).toBe('Falló');
    expect(store.loading()).toBe(false);
    expect(store.isEmpty()).toBe(false);
  });

  it('descarta una respuesta vieja que llega después de una más nueva', () => {
    const lenta = new Subject<ListItemsResponse>();
    const rapida = new Subject<ListItemsResponse>();
    client.list.mockReturnValueOnce(lenta).mockReturnValueOnce(rapida);

    store.load('a');
    store.load('ab');
    rapida.next(page(item('nuevo')));
    lenta.next(page(item('viejo')));

    expect(store.items().map((i) => i.id)).toEqual(['nuevo']);
  });

  it('select muestra el item cacheado al instante y luego el del servidor', () => {
    client.list.mockReturnValue(of(page(item('1', 'Cacheado'))));
    const detalle = new Subject<Item>();
    client.get.mockReturnValue(detalle);

    store.load();
    store.select('1');
    expect(store.selected()?.name).toBe('Cacheado');
    expect(store.selectedLoading()).toBe(true);

    detalle.next(item('1', 'Fresco'));
    expect(store.selected()?.name).toBe('Fresco');
    expect(store.selectedLoading()).toBe(false);
  });
});
