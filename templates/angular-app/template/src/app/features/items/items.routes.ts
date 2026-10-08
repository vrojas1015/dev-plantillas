import { Routes } from '@angular/router';

import { ItemsStore } from './data-access/items.store';

export const ITEMS_ROUTES: Routes = [
  {
    path: '',
    // El store vive mientras se navega dentro de la feature (lista ↔ detalle).
    providers: [ItemsStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/item-list/item-list').then((m) => m.ItemList),
      },
      {
        path: ':id',
        loadComponent: () => import('./pages/item-detail/item-detail').then((m) => m.ItemDetail),
      },
    ],
  },
];
