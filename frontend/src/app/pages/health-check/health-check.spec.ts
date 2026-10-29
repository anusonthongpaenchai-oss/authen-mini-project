import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HealthCheck } from './health-check';
describe('HealthCheck', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HealthCheck], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  it('shows the backend response and allows another check', () => {
    const fixture = TestBed.createComponent(HealthCheck);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/health').flush({ status: 'ok', message: 'Running', timestamp: '2026-01-01T00:00:00Z', uptime: 42, environment: 'development' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('เชื่อมต่อ backend สำเร็จ');
    expect(fixture.nativeElement.textContent).toContain('Running');
    fixture.nativeElement.querySelector('button').click();
    http.expectOne('http://localhost:3000/api/health').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ไม่สามารถเชื่อมต่อ backend ได้');
    http.verify();
  });
  it('does not report success for a non-ok response', () => {
    const fixture = TestBed.createComponent(HealthCheck);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/health').flush({ status: 'error' });
    expect(fixture.componentInstance.state()).toBe('error');
    http.verify();
  });
});
