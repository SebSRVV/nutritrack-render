import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export type Sex = 'female' | 'male';

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  dob: string;        // ISO yyyy-mm-dd
  sex: Sex;
  height_cm: number;
  weight_kg: number;
}

export interface RegisterResponse {
  id?: string;
  message?: string;
  // otros campos según tu backend
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = environment.apiBaseUrl; // p.ej., https://backend-nutritrack.onrender.com

  constructor(private http: HttpClient) {}

  register(dto: RegisterRequest): Observable<RegisterResponse> {
    const url = `${this.base}/api/auth/register`;

    console.log('[API/register] → payload:', dto);

    return this.http.post<RegisterResponse>(url, dto, {
      headers: { 'Content-Type': 'application/json' }
    }).pipe(
      tap((res) => {
        console.log('[API/register] ← response:', res);
      }),
      catchError((err) => {
        console.error('[API/register] ← error:', err);
        throw err; // re-lanza para que el componente lo capture
      })
    );
  }

  me<T = any>(): Observable<T> {
    const url = `${this.base}/api/auth/me`;
    return this.http.get<T>(url);
  }

  profile<T = any>(): Observable<T> {
    const url = `${this.base}/api/auth/profile`;
    return this.http.get<T>(url);
  }

  updateProfile<T = any>(body: {
    username?: string;
    sex?: 'MALE' | 'FEMALE';
    height_cm?: number;
    weight_kg?: number;
    dob?: string; // YYYY-MM-DD
    activity_level?: 'sedentary' | 'moderate' | 'very_active';
    diet_type?: 'caloric_deficit' | 'maintenance' | 'surplus';
  }): Observable<T> {
    const url = `${this.base}/api/auth/profile`;
    return this.http.patch<T>(url, body);
  }
}
