import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { UserDashboard } from './user-dashboard';

describe('Dashboard session timer', () => {
  const api = 'http://localhost:3000/api';
  const user = { id: 'user-1', name: 'Moodeng', email: 'moodeng@gmail.com', role: 'user' };
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [UserDashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function dashboard(rememberMe: boolean) {
    auth.login('moodeng@gmail.com', 'moodeng123', rememberMe).subscribe();
    http.expectOne(`${api}/auth/login`).flush({
      user,
      rememberMe,
      accessToken: 'access-1',
      expiresAt: Date.now() + 60000,
    });
    const fixture = TestBed.createComponent(UserDashboard);
    fixture.detectChanges();
    http.expectOne(`${api}/user/dashboard`).flush({ user, message: 'ข้อมูลส่วนตัว' });
    fixture.detectChanges();
    return fixture;
  }

  it('counts down, waits for an API request at zero, and resets after a successful refresh', () => {
    const fixture = dashboard(true);
    const timer = () =>
      fixture.nativeElement.querySelector('[data-testid="session-timer"]').textContent;
    expect(timer()).toContain('01:00');
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(timer()).toContain('00:59');
    vi.advanceTimersByTime(60000);
    fixture.detectChanges();
    expect(timer()).toContain('00:00');
    expect(timer()).toContain('โหลดข้อมูลเพื่อ Refresh');
    http.expectNone(`${api}/auth/refresh`);

    fixture.componentInstance.load();
    http.expectOne(`${api}/user/dashboard`).flush({}, { status: 401, statusText: 'Expired' });
    fixture.detectChanges();
    expect(timer()).toContain('กำลัง Refresh');
    http.expectOne(`${api}/auth/refresh`).flush({
      user,
      rememberMe: true,
      accessToken: 'access-2',
      expiresAt: Date.now() + 90000,
    });
    http.expectOne(`${api}/user/dashboard`).flush({ user, message: 'ข้อมูลส่วนตัว' });
    fixture.detectChanges();
    expect(timer()).toContain('01:30');
    expect(timer()).not.toContain('กำลัง Refresh');

    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('explains temporary-session expiry and returns to Login without refreshing', () => {
    const fixture = dashboard(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="session-timer"]').textContent,
    ).toContain('กลับหน้า Login เมื่อหมดเวลา');
    vi.advanceTimersByTime(60000);
    expect(auth.user()).toBeNull();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/login');
    http.expectNone(`${api}/auth/refresh`);
  });
});
