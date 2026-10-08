import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  shareReplay,
  throwError,
} from 'rxjs';

import { DomainError, toDomainError } from '@/app/api';
import { AuthClient } from './auth.client';
import { signInWithFirebase, signOutFirebase } from './firebase';
import { SessionStore } from './session.store';

/**
 * Orquesta el ciclo de vida de la sesión: login (Firebase → JWT propio),
 * refresh y logout. Es lo único que escribe en SessionStore.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = inject(SessionStore);
  private readonly client = inject(AuthClient);
  private readonly router = inject(Router);

  /**
   * Refresh en vuelo compartido: N requests concurrentes con el token vencido
   * esperan el MISMO refresh. Si cada una refrescara por su cuenta, el backend
   * (que rota el refresh token en cada uso) revocaría los tokens entre sí.
   */
  private refreshInFlight$: Observable<string> | null = null;

  async loginWithEmail(email: string, password: string): Promise<void> {
    const idToken = await signInWithFirebase(email, password);
    const res = await firstValueFrom(this.client.login({ idToken }));
    this.session.setSession(res.session, res.user);
  }

  /** Pide un access token nuevo. Emite el token y completa. */
  refresh(): Observable<string> {
    const refreshToken = this.session.refreshToken();
    if (!refreshToken) {
      return throwError(
        () => new DomainError({ status: 401, message: 'Sin sesión', details: [], traceId: null }),
      );
    }

    this.refreshInFlight$ ??= this.client.refresh({ refreshToken }).pipe(
      map((res) => {
        this.session.setSession(res.session);
        return res.session.accessToken;
      }),
      catchError((err: unknown) => {
        const error = toDomainError(err);
        // 4xx: el backend RECHAZÓ la credencial → la sesión murió.
        // 5xx / 0: el backend no pudo atender ahora → se conserva la sesión
        // para que la próxima acción pueda reintentar (no convertir una caída
        // de segundos en un logout).
        if (error.status >= 400 && error.status < 500) this.endSession();
        return throwError(() => error);
      }),
      finalize(() => (this.refreshInFlight$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight$;
  }

  async logout(): Promise<void> {
    const refreshToken = this.session.refreshToken();
    if (refreshToken) {
      // Best effort: si falla la revocación, igual se cierra la sesión local.
      await firstValueFrom(this.client.logout({ refreshToken })).catch(() => undefined);
    }
    await signOutFirebase().catch(() => undefined);
    this.endSession();
  }

  private endSession(): void {
    this.session.clear();
    void this.router.navigate(['/login']);
  }
}
