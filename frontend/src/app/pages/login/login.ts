import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
})
export class Login {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(72)]],
    rememberMe: [false],
  });

  submit() {
    if (this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { email, password, rememberMe } = this.form.getRawValue();
    this.auth
      .login(email.trim(), password, rememberMe)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.auth.homeRoute());
        },
        error: (error) => this.error.set(this.auth.errorMessage(error)),
      });
  }

  recover() {
    if (this.loading()) return;
    this.loading.set(true);
    this.auth
      .initialize()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((ok) => {
        if (ok) void this.router.navigateByUrl(this.auth.homeRoute());
      });
  }
}
