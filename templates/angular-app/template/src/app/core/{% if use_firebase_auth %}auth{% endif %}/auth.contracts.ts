/**
 * Contrato ESPERADO del backend para la sesión (Firebase ID token → JWT propio).
 * Si el gateway del proyecto usa otras rutas o shapes, se ajusta acá y en
 * `auth.client.ts`. Si el endpoint no existe, se abre un issue al backend: no se
 * inventa en el front.
 */

export interface AuthSession {
  /** JWT propio del backend. Vive SOLO en memoria. */
  accessToken: string;
  /** Token de refresco. Se persiste en localStorage para sobrevivir al F5. */
  refreshToken: string;
  /** Vencimiento del access token (ISO 8601). */
  expiresAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}

/** POST /v1/auth/login — canjea el ID token de Firebase por la sesión propia. */
export interface LoginRequest {
  idToken: string;
}

export interface LoginResponse {
  session: AuthSession;
  user: AuthUser;
}

/** POST /v1/auth/refresh */
export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  session: AuthSession;
}

/** POST /v1/auth/logout — revoca el refresh token. */
export interface LogoutRequest {
  refreshToken: string;
}
