import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { timeout } from 'rxjs';

interface HealthResponse { status: string; message: string; timestamp: string; uptime: number; environment: string; }

@Component({ imports: [DatePipe], selector: 'app-health-check', templateUrl: './health-check.html' })
export class HealthCheck implements OnInit {
  private readonly http = inject(HttpClient);
  readonly endpoint = 'http://localhost:3000/api/health';
  readonly state = signal<'loading' | 'success' | 'error'>('loading');
  readonly result = signal<HealthResponse | null>(null);

  ngOnInit(): void { this.checkHealth(); }
  checkHealth(): void {
    this.state.set('loading');
    this.result.set(null);
    this.http.get<HealthResponse>(this.endpoint).pipe(timeout(5000)).subscribe({
      next: response => {
        if (response?.status !== 'ok') { this.state.set('error'); return; }
        this.result.set(response);
        this.state.set('success');
      },
      error: () => this.state.set('error'),
    });
  }
}
