import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { toDomainError } from '../http-errors';

/**
 * Normaliza cualquier error HTTP en un `DomainError`. Va PRIMERO en la cadena
 * (ver app.config.ts): la respuesta pasa antes por el interceptor de auth, que
 * maneja los 401, y recién después se normaliza acá.
 *
 * Se loguea el path sin query string: alcanza para saber qué falló y no
 * arrastra a la consola tokens o emails que viajen como parámetros.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      const domainError = toDomainError(err);
      console.error('[API ERROR]', {
        method: req.method,
        url: req.url,
        status: domainError.status,
        traceId: domainError.api.traceId,
        message: domainError.message,
      });
      return throwError(() => domainError);
    }),
  );
