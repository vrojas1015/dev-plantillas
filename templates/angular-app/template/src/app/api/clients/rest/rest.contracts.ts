import type { HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';

/** Query params aceptados por RestClient. `null`/`undefined` se omiten. */
export type QueryParams = HttpParams | Record<string, string | number | boolean | null | undefined>;

export interface RestOptions {
  params?: QueryParams;
  headers?: HttpHeaders | Record<string, string>;
  /** Para marcar requests con tokens de contexto, p. ej. `SKIP_AUTH`. */
  context?: HttpContext;
}
