import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-session-timer',
  templateUrl: './session-timer.html',
  host: { class: 'contents' },
})
export class SessionTimer {
  readonly auth = inject(AuthService);
  // Re-read the real clock after background-tab throttling instead of decrementing a counter.
  private readonly now = toSignal(interval(1000).pipe(map(() => Date.now())), {
    initialValue: Date.now(),
  });
  readonly remainingSeconds = computed(() =>
    Math.max(0, Math.ceil((this.auth.expiresAt() - this.now()) / 1000)),
  );
  readonly tokenCountdown = computed(() => {
    const seconds = this.remainingSeconds();
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
}
