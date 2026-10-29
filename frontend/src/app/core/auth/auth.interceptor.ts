import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService, SKIP_AUTH } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (request.context.get(SKIP_AUTH) || !request.url.startsWith(`${auth.api}/`))
    return next(request);
  const originalToken = auth.accessToken();
  const withToken = (token: string | null) =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(withToken(originalToken)).pipe(
    catchError((error) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401)
        return throwError(() => error);
      if (!auth.rememberMe() || auth.loggingOut()) {
        auth.expire();
        return throwError(() => error);
      }
      // A late 401 may belong to the token already replaced by another request.
      const current = auth.accessToken();
      const retry = (token: string) =>
        next(withToken(token)).pipe(
          catchError((retryError) => {
            if (retryError instanceof HttpErrorResponse && retryError.status === 401) auth.expire();
            return throwError(() => retryError);
          }),
        );
      if (current && current !== originalToken) return retry(current);
      return auth.refresh().pipe(switchMap((response) => retry(response.accessToken)));
    }),
  );
};
