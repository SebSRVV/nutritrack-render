import { Injectable, inject, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class _Auth {
  auth = inject(AuthService);
  router = inject(Router);
  @Inject(PLATFORM_ID) platformId!: Object;
  async can(): Promise<boolean> {
    // SSR-safe: en servidor no hay localStorage ni navegación
    if (!isPlatformBrowser(this.platformId)) return true;
    const token = this.auth.getAccessToken();
    if (token) return true;
    await this.router.navigate(['/login'], { queryParams: { auth: 'required' } });
    return false;
  }
}

export const authGuard: CanActivateFn = async () => {
  const g = new _Auth();
  return g.can();
};
