import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { RestClient } from '@/app/api';
import type { Item, ListItemsRequest, ListItemsResponse } from './items.contracts';

const ITEMS = '/v1/items';

/** Cliente tipado del recurso `items`. Sólo HTTP: sin estado ni lógica de UI. */
@Injectable({ providedIn: 'root' })
export class ItemsClient {
  private readonly rest = inject(RestClient);

  list(req: ListItemsRequest = {}): Observable<ListItemsResponse> {
    return this.rest.get<ListItemsResponse>(ITEMS, {
      params: { q: req.query, page_size: req.pageSize, page_token: req.pageToken },
    });
  }

  get(id: string): Observable<Item> {
    return this.rest.get<Item>(`${ITEMS}/${encodeURIComponent(id)}`);
  }
}
