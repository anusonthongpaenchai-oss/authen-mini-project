import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import { API_BASE, AuthResponse, User } from './auth.models';

export const SKIP_AUTH = new HttpContextToken(() => false);
export const STORAGE_KEY = 'user-auth';
const context = () => new HttpContext().set(SKIP_AUTH, true);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly api = inject(API_BASE);
  readonly user = signal<User | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly rememberMe = signal(false);
  readonly refreshing = signal(false);
  readonly loggingOut = signal(false);
  readonly notice = signal('');
  readonly recoveryAvailable = signal(false);
  private readonly expiry = signal(0);
  readonly expiresAt = this.expiry.asReadonly();
  private initialized = false;
  private initialization$: Observable<boolean> | null = null;
  private refresh$: Observable<AuthResponse> | null = null;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.expiryTimer));
  }

  initialize(): Observable<boolean> {
    if (this.initialization$) return this.initialization$;
    if (this.initialized) return of(Boolean(this.user()));
    let stored: AuthResponse | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      this.removeStored();
    }
    let source: Observable<boolean>;
    if (stored) {
      if (!this.valid(stored) || stored.rememberMe || stored.expiresAt <= Date.now()) {
        this.expire();
        return of(false); // A temporary session is never upgraded by a refresh cookie.
      }
      this.apply(stored);
      source = this.http.get<User>(`${this.api}/auth/me`).pipe(
        timeout(10000),
        tap((user) => this.user.set(user)),
        map(() => true),
      );
    } else {
      source = this.refresh(true).pipe(map(() => true));
    }
    this.initialization$ = source.pipe(
      tap(() => {
        this.initialized = true;
        this.recoveryAvailable.set(false);
      }),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
          this.clear();
          this.initialized = true;
        } else {
          this.notice.set('ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองกู้ Session อีกครั้ง');
          this.recoveryAvailable.set(true);
          this.initialized = false;
        }
        return of(false);
      }),
      finalize(() => {
        this.initialization$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.initialization$;
  }

  login(email: string, password: string, rememberMe: boolean) {
    const generation = ++this.generation;
    return this.http
      .post<AuthResponse>(
        `${this.api}/auth/login`,
        { email, password, rememberMe },
        {
          withCredentials: true,
          context: context(),
        },
      )
      .pipe(
        timeout(10000),
        tap((response) => {
          if (generation !== this.generation) return;
          this.initialized = true;
          this.notice.set('');
          this.recoveryAvailable.set(false);
          this.apply(response);
        }),
      );
  }

  refresh(silent = false): Observable<AuthResponse> {
    if (this.refresh$) return this.refresh$;
    const generation = this.generation;
    this.refreshing.set(true);
    this.refresh$ = this.http
      .post<AuthResponse>(
        `${this.api}/auth/refresh`,
        {},
        {
          withCredentials: true,
          context: context(),
        },
      )
      .pipe(
        timeout(10000),
        tap((response) => {
          if (generation !== this.generation) throw new Error('Session changed');
          this.notice.set('');
          this.apply(response);
        }),
        catchError((error) => {
          if (generation === this.generation) {
            if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
              if (silent) this.clear();
              else this.expire();
            } else {
              this.notice.set('ต่ออายุ Session ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
            }
          }
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshing.set(false);
          this.refresh$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refresh$;
  }

  logout(): Observable<void> {
    this.loggingOut.set(true);
    ++this.generation; // A late refresh response cannot restore a logged-out account.
    const token = this.accessToken();
    return this.http
      .post<void>(
        `${this.api}/auth/logout`,
        {},
        {
          withCredentials: true,
          context: context(),
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      .pipe(
        timeout(10000),
        tap(() => {
          this.clear();
          this.initialized = true;
          this.notice.set('ออกจากระบบแล้ว');
          void this.router.navigateByUrl('/login');
        }),
        finalize(() => this.loggingOut.set(false)),
      );
  }

  expire() {
    ++this.generation;
    this.clear();
    this.initialized = true;
    this.notice.set('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    void this.router.navigateByUrl('/login');
  }

  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string')
      return error.error.message;
    return 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่';
  }

  private valid(value: AuthResponse): boolean {
    return (
      typeof value?.accessToken === 'string' &&
      Number.isFinite(value?.expiresAt) &&
      typeof value?.rememberMe === 'boolean' &&
      value?.user?.role === 'user' &&
      typeof value.user.id === 'string' &&
      typeof value.user.name === 'string' &&
      typeof value.user.email === 'string'
    );
  }

  private apply(response: AuthResponse) {
    if (!this.valid(response) || response.expiresAt <= Date.now())
      throw new Error('Invalid authentication response');
    clearTimeout(this.expiryTimer);
    this.accessToken.set(response.accessToken);
    this.user.set(response.user);
    this.rememberMe.set(response.rememberMe);
    this.expiry.set(response.expiresAt);
    this.removeStored();
    if (!response.rememberMe) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(response));
      } catch {
        this.notice.set('Browser ไม่อนุญาตให้เก็บ Session การรีโหลดจะต้องเข้าสู่ระบบใหม่');
      }
      this.expiryTimer = setTimeout(
        () => this.expire(),
        Math.max(0, this.expiresAt() - Date.now()),
      );
    }
  }

  private clear() {
    clearTimeout(this.expiryTimer);
    this.accessToken.set(null);
    this.user.set(null);
    this.rememberMe.set(false);
    this.expiry.set(0);
    this.recoveryAvailable.set(false);
    this.removeStored();
  }

  private removeStored() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage can be disabled by the browser. */
    }
  }
}
