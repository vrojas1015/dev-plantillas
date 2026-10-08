import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { RestClient, SKIP_AUTH } from '@/app/api';
import type {
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  RefreshRequest,
  RefreshResponse,
} from './auth.contracts';

const AUTH = '/v1/auth';

/** Cliente de los endpoints de sesión. Login y refresh son públicos (SKIP_AUTH). */
@Injectable({ providedIn: 'root' })
export class AuthClient {
  private readonly rest = inject(RestClient);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.rest.post<LoginResponse>(`${AUTH}/login`, body, { context: publicContext() });
  }

  refresh(body: RefreshRequest): Observable<RefreshResponse> {
    return this.rest.post<RefreshResponse>(`${AUTH}/refresh`, body, { context: publicContext() });
  }

  logout(body: LogoutRequest): Observable<void> {
    return this.rest.post<void>(`${AUTH}/logout`, body);
  }
}

function publicContext(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true);
}
