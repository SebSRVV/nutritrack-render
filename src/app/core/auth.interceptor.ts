// src/app/core/auth.interceptor.ts
import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, of, Subject, filter, take } from 'rxjs';

function isBackend(url: string): boolean {
  if (url.startsWith('/')) return true; // proxy /api en el mismo host
  return !!environment.apiBaseUrl && url.startsWith(environment.apiBaseUrl);
}

/** Rutas PÚBLICAS: jamás adjuntar Authorization */
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/metrics',
];

function isPublicEndpoint(urlStr: string): boolean {
  let base = 'http://localhost';
  try { base = (globalThis as any).window?.location?.origin ?? base; } catch {}
  const url = new URL(urlStr, base);
  return PUBLIC_PATHS.some(p => url.pathname.startsWith(p));
}

// Estado de refresco (compartido entre peticiones concurrentes)
let isRefreshing = false;
const refreshSubject = new Subject<string>();

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!isBackend(req.url) || isPublicEndpoint(req.url)) {
    return next(req);
  }

  const token = auth.getAccessToken();
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err: any) => {
      const isHttpErr = err instanceof HttpErrorResponse;
      const is401 = isHttpErr && err.status === 401;
      const isRefreshCall = req.url.includes('/api/auth/refresh') || req.url.includes('/api/auth/login');

      if (!is401 || isRefreshCall) {
        return throwError(() => err);
      }

      const refreshToken = auth.getRefreshToken();
      if (!refreshToken) {
        auth.logout();
        // Navegar solo en navegador
        try { (globalThis as any).window && router.navigate(['/login'], { queryParams: { auth: 'expired' } }); } catch {}
        return throwError(() => err);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        // Inicia refresco
        return auth.refresh().pipe(
          switchMap((tokens) => {
            isRefreshing = false;
            const newAccess = tokens?.access_token ?? auth.getAccessToken() ?? '';
            refreshSubject.next(newAccess);
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${newAccess}` } });
            return next(retried);
          }),
          catchError((refreshErr) => {
            isRefreshing = false;
            auth.logout();
            try { (globalThis as any).window && router.navigate(['/login'], { queryParams: { auth: 'expired' } }); } catch {}
            return throwError(() => refreshErr);
          })
        );
      } else {
        // Espera a que el refresco termine y reintenta con el nuevo token
        return refreshSubject.pipe(
          filter(t => !!t),
          take(1),
          switchMap((newAccess) => {
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${newAccess}` } });
            return next(retried);
          })
        );
      }
    })
  );
};
