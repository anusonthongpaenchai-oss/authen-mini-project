import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize, interval, map, timeout } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/auth/auth.models';

@Component({ selector: 'app-user-dashboard', templateUrl: './user-dashboard.html' })
export class UserDashboard implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  // Use the real clock so background-tab throttling does not accumulate countdown drift.
  private readonly now = toSignal(interval(1000).pipe(map(() => Date.now())), {
    initialValue: Date.now(),
  });
  readonly remainingSeconds = computed(() =>
    Math.max(0, Math.ceil((this.auth.expiresAt() - this.now()) / 1000)),
  );
  readonly tokenCountdown = computed(() => {
    const seconds = this.remainingSeconds();
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  });

  ngOnInit() {
    this.load();
  }
  load() {
    if (this.loading() || this.auth.loggingOut()) return;
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<{ user: User; message: string }>(`${this.auth.api}/user/dashboard`)
      .pipe(
        timeout(15000),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => this.message.set(response.message),
        error: (error) => this.error.set(this.auth.errorMessage(error)),
      });
  }
  logout() {
    if (this.auth.loggingOut() || this.loading() || this.auth.refreshing()) return;
    this.error.set('');
    this.auth
      .logout()
      .subscribe({ error: (error) => this.error.set(this.auth.errorMessage(error)) });
  }
}
