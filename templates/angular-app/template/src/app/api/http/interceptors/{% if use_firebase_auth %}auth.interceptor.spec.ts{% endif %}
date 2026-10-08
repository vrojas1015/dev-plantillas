import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@/app/core/auth/auth.service';
import { SessionStore } from '@/app/core/auth/session.store';
import { environment } from '@/environments/environment';
import { SKIP_AUTH } from '../tokens';
import { authInterceptor } from './auth.interceptor';

const URL = 'https://api.test/v1/items';
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionStore;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    refresh = vi.fn(() => {
      session.setSession({ accessToken: 'nuevo', refreshToken: 'rt-2', expiresAt: inOneHour() });
      return of('nuevo');
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { refresh } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => httpMock.verify());

  it('agrega el Bearer cuando hay sesión', () => {
    session.setSession({ accessToken: 'abc', refreshToken: 'rt-1', expiresAt: inOneHour() });

    http.get(URL).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush({});
  });

  it('no toca las requests marcadas con SKIP_AUTH', () => {
    session.setSession({ accessToken: 'abc', refreshToken: 'rt-1', expiresAt: inOneHour() });

    http.get(URL, { context: new HttpContext().set(SKIP_AUTH, true) }).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('ante un 401 refresca y reintenta una vez con el token nuevo', () => {
    session.setSession({ accessToken: 'viejo', refreshToken: 'rt-1', expiresAt: inOneHour() });
    let body: unknown;

    http.get(URL).subscribe((res) => (body = res));

    httpMock.expectOne(URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    const retry = httpMock.expectOne(URL);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush({ ok: true });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true });
  });

  it('post-F5 (sólo refresh token) refresca antes de mandar la request', () => {
    localStorage.setItem(`${environment.appName}:rt`, 'rt-guardado');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { refresh: () => of('recuperado') } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.get(URL).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer recuperado');
    req.flush({});
  });
});
