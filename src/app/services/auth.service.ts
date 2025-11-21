import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export type Sex = 'FEMALE' | 'MALE';

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  dob: string;        // ISO yyyy-mm-dd
  sex: Sex;
  height_cm: number;
  weight_kg: number;
}

export interface RegisterResponse { id?: string; message?: string; }

export interface LoginRequest { email: string; password: string; }
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface UpdateProfileRequest {
  username?: string | null;
  dob?: string | null;
  sex?: Sex | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_level?: 'sedentary' | 'moderate' | 'very_active' | null;
  diet_type?: 'low_carb' | 'caloric_deficit' | 'surplus' | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = environment.apiBaseUrl; // https://backend-nutritrack.onrender.com
  private tokenKey = 'auth_token';
  private refreshKey = 'refresh_token';
  private isBrowser: boolean;

  constructor(private http: HttpClient, @Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  register(dto: RegisterRequest): Observable<RegisterResponse> {
    const url = `${this.base}/api/auth/register`;
    return this.http.post<RegisterResponse>(url, dto, { headers: { 'Content-Type': 'application/json' } }).pipe(
      tap((res) => { console.log('[API/register] ← response:', res); }),
      catchError((err) => { console.error('[API/register] ← error:', err); throw err; })
    );
  }

  // Tokens helpers
  setTokens(t: TokenResponse) {
    if (!this.isBrowser) return;
    if (t?.access_token) localStorage.setItem(this.tokenKey, t.access_token);
    if (t?.refresh_token) localStorage.setItem(this.refreshKey, t.refresh_token);
  }
  clearTokens() {
    if (!this.isBrowser) return;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshKey);
  }
  getAccessToken(): string | null { return this.isBrowser ? localStorage.getItem(this.tokenKey) : null; }
  getRefreshToken(): string | null { return this.isBrowser ? localStorage.getItem(this.refreshKey) : null; }

  // Auth endpoints
  login(dto: LoginRequest): Observable<TokenResponse> {
    const url = `${this.base}/api/auth/login`;
    return this.http.post<TokenResponse>(url, dto, { headers: { 'Content-Type': 'application/json' } }).pipe(
      tap(tokens => { this.setTokens(tokens); console.log('[API/login] ok'); }),
      catchError(err => { console.error('[API/login] error:', err); throw err; })
    );
  }

  logout() { this.clearTokens(); }

  refresh(): Observable<TokenResponse> {
    const url = `${this.base}/api/auth/refresh`;
    const refresh_token = this.getRefreshToken();
    return this.http.post<TokenResponse>(url, { refresh_token }).pipe(
      tap(tokens => this.setTokens(tokens))
    );
  }

  me(): Observable<any> {
    const url = `${this.base}/api/auth/me`;
    return this.http.get<any>(url).pipe(
      tap(res => console.log('[API/me] ←', res)),
      catchError(err => { console.error('[API/me] error:', err); throw err; })
    );
  }

  updateProfile(body: UpdateProfileRequest): Observable<any> {
    const url = `${this.base}/api/auth/profile`;
    return this.http.patch(url, body).pipe(
      tap(res => console.log('[API/profile] ←', res)),
      catchError(err => { console.error('[API/profile] error:', err); throw err; })
    );
  }

  deleteAccount(confirm: boolean): Observable<{ message: string }> {
    const url = `${this.base}/api/auth/delete`;
    return this.http.request<{ message: string }>('DELETE', url, { body: { confirm } }).pipe(
      tap(() => console.log('[API/delete] ok')),
      catchError(err => { console.error('[API/delete] error:', err); throw err; })
    );
  }
}
