import { Injectable, computed, signal } from '@angular/core';

import { environment } from '@/environments/environment';
import type { AuthSession, AuthUser } from './auth.contracts';

/** Margen para considerar vencido el access token antes de que lo rechace el backend. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * Estado de la sesión, con signals.
 *
 * - accessToken: SOLO en memoria (se pierde con el F5; el interceptor lo
 *   recupera con el refresh token en la primera request).
 * - refreshToken y user: en localStorage, con prefijo por app.
 *
 * No hace HTTP: eso es de AuthService. Este store sólo guarda y expone estado.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly rtKey = `${environment.appName}:rt`;
  private readonly userKey = `${environment.appName}:user`;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _expiresAt = signal<number | null>(null);
  private readonly _refreshToken = signal<string | null>(readStorage(this.rtKey));
  private readonly _user = signal<AuthUser | null>(readJson<AuthUser>(this.userKey));

  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._accessToken() !== null);
  /** Hay forma de operar: token vigente o un refresh token para pedir uno. */
  readonly hasSession = computed(() => this.isAuthenticated() || this._refreshToken() !== null);

  setSession(session: AuthSession, user?: AuthUser): void {
    this._accessToken.set(session.accessToken);
    const exp = Date.parse(session.expiresAt);
    this._expiresAt.set(Number.isNaN(exp) ? null : exp);
    this._refreshToken.set(session.refreshToken);
    writeStorage(this.rtKey, session.refreshToken);
    if (user) {
      this._user.set(user);
      writeStorage(this.userKey, JSON.stringify(user));
    }
  }

  isTokenExpired(now: number = Date.now()): boolean {
    const exp = this._expiresAt();
    return exp !== null && now >= exp - EXPIRY_SKEW_MS;
  }

  clear(): void {
    this._accessToken.set(null);
    this._expiresAt.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    writeStorage(this.rtKey, null);
    writeStorage(this.userKey, null);
  }
}

// localStorage puede tirar (modo privado, storage bloqueado): nunca rompe la app.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const raw = readStorage(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // sin storage: la sesión vive sólo en memoria
  }
}
