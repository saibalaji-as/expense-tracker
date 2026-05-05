import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { from } from 'rxjs';
import { AuthService } from '../services/auth.service';

function addAuthHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Only intercept Google APIs requests
  if (!req.url.includes('googleapis.com')) {
    return next(req);
  }

  const token = authService.getAccessToken();
  const authReq = token ? addAuthHeader(req, token) : req;

  return next(authReq).pipe(
    catchError((error) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      // Attempt a silent token refresh and retry once
      return from(authService.ensureToken()).pipe(
        switchMap((newToken) => {
          const retryReq = addAuthHeader(req, newToken);
          return next(retryReq).pipe(
            catchError((retryError) => {
              if (retryError.status === 401) {
                router.navigate(['/auth/callback']);
              }
              return throwError(() => retryError);
            })
          );
        }),
        catchError((refreshError) => {
          // refreshToken() already cleared auth state; redirect to sign-in
          router.navigate(['/auth/callback']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};
