import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

export const userGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .initialize()
    .pipe(map((authenticated) => authenticated || router.createUrlTree(['/login'])));
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .initialize()
    .pipe(map((authenticated) => (authenticated ? router.createUrlTree(['/dashboard']) : true)));
};
