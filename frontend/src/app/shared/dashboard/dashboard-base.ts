import { HttpClient } from '@angular/common/http';
import { Directive, inject, OnInit, signal } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Role, User } from '../../core/auth/auth.models';

/** Common request, loading, error and logout behavior for both role-specific pages. */
@Directive()
export abstract class DashboardBase implements OnInit {
  abstract readonly role: Role;
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    if (this.loading() || this.auth.loggingOut()) return;
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<{ user: User; message: string }>(`${this.auth.api}/${this.role}/dashboard`)
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
