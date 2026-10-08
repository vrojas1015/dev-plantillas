/**
 * Contratos del recurso de ejemplo `items`. Reflejan el JSON que devuelve el
 * API Gateway. En una feature real se copian del contrato del backend (proto /
 * OpenAPI), nunca se inventan: si falta un campo o endpoint, issue al backend.
 */

export type ItemStatus = 'active' | 'archived';

export interface Item {
  id: string;
  name: string;
  description: string;
  status: ItemStatus;
  /** ISO 8601 */
  updatedAt: string;
}

/** GET /v1/items */
export interface ListItemsRequest {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ListItemsResponse {
  items: Item[];
  /** Vacío cuando no hay más páginas. */
  nextPageToken: string;
}
