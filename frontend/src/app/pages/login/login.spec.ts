import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('shows validation without making a request for incomplete input', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('กรุณากรอก Email ให้ถูกต้อง');
    expect(fixture.nativeElement.textContent).toContain('กรุณากรอก Password');
    TestBed.inject(HttpTestingController).expectNone('http://localhost:3000/api/auth/login');
  });
  it('shows a loading state then a server error on incorrect credentials', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.form.setValue({
      email: 'moodeng@gmail.com',
      password: 'wrong',
      rememberMe: true,
    });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('http://localhost:3000/api/auth/login')
      .flush(
        { message: 'Email หรือ Password ไม่ถูกต้อง' },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Email หรือ Password ไม่ถูกต้อง');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    http.verify();
  });

  for (const role of ['user', 'admin'] as const) {
    it(`redirects ${role} to its dashboard after Login without sending a role selector`, () => {
      const fixture = TestBed.createComponent(Login);
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const email = role === 'admin' ? 'admin@gmail.com' : 'moodeng@gmail.com';
      fixture.componentInstance.form.setValue({ email, password: 'password', rememberMe: true });
      fixture.componentInstance.submit();
      const http = TestBed.inject(HttpTestingController);
      const request = http.expectOne('http://localhost:3000/api/auth/login');
      expect(request.request.body.role).toBeUndefined();
      request.flush({
        user: { id: role, name: role, email, role },
        rememberMe: true,
        accessToken: 'token',
        expiresAt: Date.now() + 60000,
      });
      expect(navigate).toHaveBeenCalledWith(role === 'admin' ? '/admin/dashboard' : '/dashboard');
      http.verify();
      navigate.mockRestore();
    });

    it(`redirects ${role} to its dashboard after recovering a remembered session`, () => {
      const fixture = TestBed.createComponent(Login);
      const auth = TestBed.inject(AuthService);
      sessionStorage.clear();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      fixture.componentInstance.recover();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('http://localhost:3000/api/auth/refresh').flush({
        user: { id: role, name: role, email: `${role}@example.com`, role },
        rememberMe: true,
        accessToken: 'token',
        expiresAt: Date.now() + 60000,
      });
      expect(auth.user()?.role).toBe(role);
      expect(navigate).toHaveBeenCalledWith(role === 'admin' ? '/admin/dashboard' : '/dashboard');
      http.verify();
      navigate.mockRestore();
    });
  }
});
