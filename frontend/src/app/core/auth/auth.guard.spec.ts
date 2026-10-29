import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { adminGuard, guestGuard, userGuard } from './auth.guard';
import { AuthService, STORAGE_KEY } from './auth.service';

describe.each(['user', 'admin'] as const)('%s role navigation', (role) => {
  const api = 'http://localhost:3000/api';
  const home = role === 'admin' ? '/admin/dashboard' : '/dashboard';
  const user = { id: `${role}-1`, email: `${role}@example.com`, name: role, role };
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  const run = (guard: CanActivateFn) =>
    firstValueFrom(
      TestBed.runInInjectionContext(() => guard({} as never, {} as never)) as Observable<
        boolean | UrlTree
      >,
    );

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('allows only its own dashboard and redirects cross-role and login visits to its home', async () => {
    auth.login(user.email, 'password', true).subscribe();
    http
      .expectOne(`${api}/auth/login`)
      .flush({ user, rememberMe: true, accessToken: 'token', expiresAt: Date.now() + 60000 });
    const ownGuard = role === 'admin' ? adminGuard : userGuard;
    const otherGuard = role === 'admin' ? userGuard : adminGuard;
    expect(await run(ownGuard)).toBe(true);
    expect(router.serializeUrl((await run(otherGuard)) as UrlTree)).toBe(home);
    expect(router.serializeUrl((await run(guestGuard)) as UrlTree)).toBe(home);
  });

  it('uses the role returned by /me instead of a modified sessionStorage role on reload', async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: { ...user, role: role === 'admin' ? 'user' : 'admin' },
        rememberMe: false,
        accessToken: 'token',
        expiresAt: Date.now() + 60000,
      }),
    );
    const result = run(role === 'admin' ? adminGuard : userGuard);
    http.expectOne(`${api}/auth/me`).flush(user);
    expect(await result).toBe(true);
    expect(auth.homeRoute()).toBe(home);
  });

  it('waits for remembered-session recovery before redirecting away from Login', async () => {
    const result = run(guestGuard);
    http
      .expectOne(`${api}/auth/refresh`)
      .flush({ user, rememberMe: true, accessToken: 'token', expiresAt: Date.now() + 60000 });
    expect(router.serializeUrl((await result) as UrlTree)).toBe(home);
  });

  it('redirects an unauthenticated visitor to Login without repeated refreshes', async () => {
    const result = run(role === 'admin' ? adminGuard : userGuard);
    http.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(router.serializeUrl((await result) as UrlTree)).toBe('/login');
    expect(
      router.serializeUrl((await run(role === 'admin' ? adminGuard : userGuard)) as UrlTree),
    ).toBe('/login');
    http.expectNone(`${api}/auth/refresh`);
  });
});
