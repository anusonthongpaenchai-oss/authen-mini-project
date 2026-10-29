import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
