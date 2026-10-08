import { HttpContextToken } from '@angular/common/http';

/**
 * Marca una request como pública: el interceptor de auth no le agrega
 * `Authorization` ni intenta refrescar. Para login, refresh, health, o
 * requests a hosts de terceros.
 *
 *   this.rest.post(url, body, { context: new HttpContext().set(SKIP_AUTH, true) })
 */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
