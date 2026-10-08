import { environment } from '@/environments/environment';

/** URL base del API Gateway del ambiente actual (ver src/environments). */
export const API_BASE_URL = environment.apiBaseUrl;

/**
 * Une la base del API con una ruta, normalizando barras.
 *   joinApi('/v1/items') → `${API_BASE_URL}/v1/items`
 */
export function joinApi(path: string, base: string = API_BASE_URL): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
