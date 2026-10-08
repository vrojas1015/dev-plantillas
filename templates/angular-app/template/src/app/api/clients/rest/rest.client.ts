import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { QueryParams, RestOptions } from './rest.contracts';
import { joinApi } from './rest.endpoints';

function toHttpParams(params?: QueryParams): HttpParams | undefined {
  if (!params) return undefined;
  if (params instanceof HttpParams) return params;
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    hp = hp.set(k, String(v));
  }
  return hp;
}

function toHttpHeaders(headers?: RestOptions['headers']): HttpHeaders | undefined {
  if (!headers) return undefined;
  return headers instanceof HttpHeaders ? headers : new HttpHeaders(headers);
}

/**
 * Cliente HTTP base contra el API Gateway. Los clientes de cada feature
 * (`features/<x>/data-access/<x>.client.ts`) lo usan con rutas relativas y
 * tipos de `<x>.contracts.ts`; nunca llaman a HttpClient directo.
 */
@Injectable({ providedIn: 'root' })
export class RestClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, options: RestOptions = {}): Observable<T> {
    return this.http.get<T>(joinApi(path), this.toOptions(options));
  }

  post<T>(path: string, body?: unknown, options: RestOptions = {}): Observable<T> {
    return this.http.post<T>(joinApi(path), body ?? {}, this.toOptions(options));
  }

  put<T>(path: string, body?: unknown, options: RestOptions = {}): Observable<T> {
    return this.http.put<T>(joinApi(path), body ?? {}, this.toOptions(options));
  }

  patch<T>(path: string, body?: unknown, options: RestOptions = {}): Observable<T> {
    return this.http.patch<T>(joinApi(path), body ?? {}, this.toOptions(options));
  }

  delete<T>(path: string, options: RestOptions = {}): Observable<T> {
    return this.http.delete<T>(joinApi(path), this.toOptions(options));
  }

  private toOptions(options: RestOptions) {
    return {
      context: options.context,
      headers: toHttpHeaders(options.headers),
      params: toHttpParams(options.params),
    };
  }
}
