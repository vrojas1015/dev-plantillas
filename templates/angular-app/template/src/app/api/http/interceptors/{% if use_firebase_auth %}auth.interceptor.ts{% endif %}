import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, switchMap, throwError } from 'rxjs';

import { AuthService } from '@/app/core/auth/auth.service';
import { SessionStore } from '@/app/core/auth/session.store';
import { SKIP_AUTH } from '../tokens';

/**
 * Agrega `Authorization: Bearer <accessToken>` y mantiene viva la sesión:
 *
 * 1. Sin access token pero con refresh token (caso post-F5), o token vencido →
 *    refresca ANTES de mandar la request.
 * 2. Si el backend responde 401 → refresca y reintenta UNA vez.
 *
 * El refresh en sí (compartido entre requests concurrentes, y qué hacer si
 * falla) vive en AuthService. Las requests con SKIP_AUTH pasan intactas.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH)) return next(req);

  const session = inject(SessionStore);
  const auth = inject(AuthService);

  const mustRefreshFirst =
    session.refreshToken() !== null && (!session.isAuthenticated() || session.isTokenExpired());
  const token$ = mustRefreshFirst ? auth.refresh() : of(session.accessToken());

  return token$.pipe(
    switchMap((token) =>
      next(withBearer(req, token)).pipe(
        catchError((err: unknown) => {
          const isUnauthorized = err instanceof HttpErrorResponse && err.status === 401;
          if (!isUnauthorized || session.refreshToken() === null) return throwError(() => err);
          return auth.refresh().pipe(switchMap((fresh) => next(withBearer(req, fresh))));
        }),
      ),
    ),
  );
};

function withBearer<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
