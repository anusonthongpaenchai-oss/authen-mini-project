import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, STORAGE_KEY } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { AuthResponse, Role } from './auth.models';
import { adminGuard, userGuard } from './auth.guard';

describe.each(['user', 'admin'] as const)('%s authentication lifecycle', (role: Role) => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  let navigate: ReturnType<typeof vi.spyOn>;
  const api = 'http://localhost:3000/api';
  const response = (rememberMe = true, token = 'access-1'): AuthResponse => ({
    accessToken: token,
    expiresAt: Date.now() + 60000,
    rememberMe,
    user: {
      id: `${role}-1`,
      email: role === 'admin' ? 'admin@gmail.com' : 'moodeng@gmail.com',
      name: role === 'admin' ? 'Admin' : 'Moodeng',
      role,
    },
  });
  function login(rememberMe = true) {
    auth
      .login(
        role === 'admin' ? 'admin@gmail.com' : 'moodeng@gmail.com',
        role === 'admin' ? 'admin123' : 'moodeng123',
        rememberMe,
      )
      .subscribe();
    const request = http.expectOne(`${api}/auth/login`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body.rememberMe).toBe(rememberMe);
    request.flush(response(rememberMe));
  }
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stores a temporary token only in sessionStorage and expires without an API request', () => {
    login(false);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).accessToken).toBe('access-1');
    vi.advanceTimersByTime(60001);
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    http.expectNone(`${api}/auth/refresh`);
  });

  it('restores a valid temporary session on reload and checks /me', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(response(false)));
    const ready = firstValueFrom(auth.initialize());
    const request = http.expectOne(`${api}/auth/me`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush(response().user);
    expect(await ready).toBe(true);
    expect(auth.rememberMe()).toBe(false);
    http.expectNone(`${api}/auth/refresh`);
  });

  it('never refreshes an expired temporary session found on reload', async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...response(false), expiresAt: Date.now() - 1 }),
    );
    expect(await firstValueFrom(auth.initialize())).toBe(false);
    expect(auth.notice()).toContain('Session หมดอายุ');
    http.expectNone(`${api}/auth/refresh`);
  });

  it('restores remembered sessions with a credentialed cookie request, keeping access tokens in memory', async () => {
    const ready = firstValueFrom(auth.initialize());
    const request = http.expectOne(`${api}/auth/refresh`);
    expect(request.request.withCredentials).toBe(true);
    expect(auth.refreshing()).toBe(true);
    request.flush(response());
    expect(await ready).toBe(true);
    expect(auth.refreshing()).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('waits for session restoration before the role guard resolves', async () => {
    const guard = role === 'admin' ? adminGuard : userGuard;
    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    let allowed: unknown;
    (result as ReturnType<AuthService['initialize']>).subscribe((value) => {
      allowed = value;
    });
    expect(allowed).toBeUndefined();
    http.expectOne(`${api}/auth/refresh`).flush(response());
    expect(allowed).toBe(true);
  });

  it('allows an anonymous visitor after a single failed restore without looping refresh', async () => {
    const ready = firstValueFrom(auth.initialize());
    http.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await ready).toBe(false);
    expect(await firstValueFrom(auth.initialize())).toBe(false);
    http.expectNone(`${api}/auth/refresh`);
  });

  it('permits explicit session-recovery retry after a network failure', async () => {
    const first = firstValueFrom(auth.initialize());
    http.expectOne(`${api}/auth/refresh`).error(new ProgressEvent('error'));
    expect(await first).toBe(false);
    expect(auth.recoveryAvailable()).toBe(true);
    const retry = firstValueFrom(auth.initialize());
    http.expectOne(`${api}/auth/refresh`).flush(response());
    expect(await retry).toBe(true);
    expect(auth.recoveryAvailable()).toBe(false);
  });

  it('shares one refresh for concurrent 401s and retries both requests with the new token', () => {
    login();
    client.get(`${api}/${role}/dashboard`).subscribe();
    client.get(`${api}/auth/me`).subscribe();
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/me`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/refresh`).flush(response(true, 'access-2'));
    const retries = http.match(
      (request) => request.url === `${api}/${role}/dashboard` || request.url === `${api}/auth/me`,
    );
    expect(retries.length).toBe(2);
    retries.forEach((request) => {
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-2');
      request.flush({});
    });
    expect(auth.refreshing()).toBe(false);
  });

  it('reuses a refreshed token for a late 401 without issuing another refresh', () => {
    login();
    client.get(`${api}/${role}/dashboard`).subscribe();
    client.get(`${api}/auth/me`).subscribe();
    const late = http.expectOne(`${api}/auth/me`);
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/refresh`).flush(response(true, 'access-2'));
    http.expectOne(`${api}/${role}/dashboard`).flush({});
    late.flush({}, { status: 401, statusText: 'Expired' });
    const retried = http.expectOne(`${api}/auth/me`);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer access-2');
    retried.flush({});
    http.expectNone(`${api}/auth/refresh`);
  });

  it('clears the session when refresh is rejected and never loops', () => {
    login();
    let errors = 0;
    client.get(`${api}/${role}/dashboard`).subscribe({ error: () => errors++ });
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Revoked' });
    expect(errors).toBe(1);
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    http.expectNone(`${api}/auth/refresh`);
  });

  it('retries the original API at most once even if its new token is rejected', () => {
    login();
    client.get(`${api}/${role}/dashboard`).subscribe({ error: () => {} });
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/refresh`).flush(response(true, 'access-2'));
    http
      .expectOne(`${api}/${role}/dashboard`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    http.expectNone(`${api}/auth/refresh`);
  });

  it('does not refresh temporary sessions, login failures, forbidden responses or other origins', () => {
    login(false);
    client.get('https://other.example/api/data').subscribe({ error: () => {} });
    const external = http.expectOne('https://other.example/api/data');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({}, { status: 401, statusText: 'Unauthorized' });
    client.get(`${api}/${role}/dashboard`).subscribe({ error: () => {} });
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.user()).not.toBeNull();
    client.get(`${api}/${role}/dashboard`).subscribe({ error: () => {} });
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    expect(auth.user()).toBeNull();
    auth.login('wrong@example.com', 'wrong', true).subscribe({ error: () => {} });
    http
      .expectOne(`${api}/auth/login`)
      .flush({}, { status: 401, statusText: 'Invalid credentials' });
    http.expectNone(`${api}/auth/refresh`);
  });

  it('retains the remembered session after a network error so a user can retry', () => {
    login();
    client.get(`${api}/${role}/dashboard`).subscribe({ error: () => {} });
    http.expectOne(`${api}/${role}/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    http.expectOne(`${api}/auth/refresh`).error(new ProgressEvent('error'));
    expect(auth.user()).not.toBeNull();
    expect(auth.notice()).toContain('เชื่อมต่อ');
    expect(auth.refreshing()).toBe(false);
  });

  it('clears state only after successful server logout and allows retry after failure', () => {
    login(false);
    auth.logout().subscribe({ error: () => {} });
    http.expectOne(`${api}/auth/logout`).error(new ProgressEvent('error'));
    expect(auth.user()).not.toBeNull();
    expect(auth.loggingOut()).toBe(false);
    auth.logout().subscribe();
    const request = http.expectOne(`${api}/auth/logout`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('cannot restore a session from a refresh response arriving after logout', () => {
    login();
    auth.refresh().subscribe({ error: () => {} });
    const late = http.expectOne(`${api}/auth/refresh`);
    auth.logout().subscribe();
    http.expectOne(`${api}/auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
    late.flush(response(true, 'late-access'));
    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
  });
});
