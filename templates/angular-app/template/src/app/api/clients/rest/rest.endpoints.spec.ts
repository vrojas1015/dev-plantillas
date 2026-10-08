import { describe, expect, it } from 'vitest';

import { joinApi } from './rest.endpoints';

describe('joinApi', () => {
  it('une base y ruta con una sola barra', () => {
    expect(joinApi('/v1/items', 'https://api.test/')).toBe('https://api.test/v1/items');
  });

  it('agrega la barra inicial si falta', () => {
    expect(joinApi('v1/items', 'https://api.test')).toBe('https://api.test/v1/items');
  });
});
