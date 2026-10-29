import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { Role } from './auth.models';

function guardRole(role: Role): CanActivateFn {
  return () => {
    const router = inject(Router);
    const auth = inject(AuthService);
    return auth.initialize().pipe(
      map((authenticated) => {
        if (!authenticated) return router.createUrlTree(['/login']);
        return auth.user()?.role === role ? true : router.parseUrl(auth.homeRoute());
      }),
    );
  };
}

export const userGuard = guardRole('user');
export const adminGuard = guardRole('admin');

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  return auth
    .initialize()
    .pipe(map((authenticated) => (authenticated ? router.parseUrl(auth.homeRoute()) : true)));
};
