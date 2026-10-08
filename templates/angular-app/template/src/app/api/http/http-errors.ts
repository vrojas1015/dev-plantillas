import { HttpErrorResponse } from '@angular/common/http';

/** Error normalizado del API (lo arma `errorInterceptor`). */
export interface ApiError {
  /** HTTP status (0 = sin respuesta: red caída, CORS, DNS). */
  status: number;
  message: string;
  details: unknown[];
  /** Header `X-Trace-Id`, para correlacionar con los logs del backend. */
  traceId: string | null;
}

/**
 * Error tipado que reciben los `catchError` de stores y componentes. Clasifica
 * por HTTP status con helpers, así nadie compara números sueltos:
 *
 *   if (isDomainError(err) && err.isNotFound()) { ... }
 */
export class DomainError extends Error {
  readonly api: ApiError;

  constructor(api: ApiError) {
    super(api.message);
    this.name = 'DomainError';
    this.api = api;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  get status(): number {
    return this.api.status;
  }

  isNetwork(): boolean {
    return this.api.status === 0;
  }

  isValidation(): boolean {
    return this.api.status === 400 || this.api.status === 422;
  }

  isUnauthorized(): boolean {
    return this.api.status === 401;
  }

  isForbidden(): boolean {
    return this.api.status === 403;
  }

  isNotFound(): boolean {
    return this.api.status === 404;
  }

  isConflict(): boolean {
    return this.api.status === 409;
  }

  isRateLimited(): boolean {
    return this.api.status === 429;
  }

  isServer(): boolean {
    return this.api.status >= 500;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/** Convierte cualquier error en DomainError (idempotente). */
export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = (err.error ?? {}) as { message?: string; details?: unknown[] };
    return new DomainError({
      status: err.status,
      message: body.message ?? err.message ?? 'Error inesperado',
      details: body.details ?? [],
      traceId: err.headers?.get('X-Trace-Id') ?? null,
    });
  }
  return new DomainError({
    status: 0,
    message: err instanceof Error ? err.message : 'Error inesperado',
    details: [],
    traceId: null,
  });
}
