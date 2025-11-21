// src/app/services/goals.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service';

@Injectable({ providedIn: 'root' })
export class GoalsService {
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService);
  private baseUrl = `${environment.apiBaseUrl}/api/goals`;

  /** Obtener token de forma robusta (SSR-safe) */
  private async getToken(): Promise<string | null> {
    try {
      // 1) Intentar vía sesión normal
      const { data: { session } } = await this.supabase.client.auth.getSession();
      if (session?.access_token) return session.access_token;

      // 2) Intentar vía getUser() cuando getSession() falla en SSR
      const { data: udata } = await this.supabase.client.auth.getUser();
      const token = (udata as any)?.session?.access_token ?? null;
      return token;
    } catch (err) {
      console.warn('No se pudo obtener token:', err);
      return null;
    }
  }

  /** Obtener UID robustamente */
  async getCurrentUserId(): Promise<string | null> {
    try {
      const { data: { session } } = await this.supabase.client.auth.getSession();
      if (session?.user?.id) return session.user.id;

      const { data } = await this.supabase.client.auth.getUser();
      return data?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  /** Headers seguros */
  private async createAuthHeaders(): Promise<{ [key: string]: string }> {
    const token = await this.getToken();
    const headers: any = { 'Content-Type': 'application/json' };

    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  listGoals(userId: string): Observable<any[]> {
    const params = new HttpParams().set('userId', userId);
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => this.http.get<any[]>(this.baseUrl, { headers, params }))
    );
  }

  createGoal(userId: string, body: any): Observable<any> {
    const params = new HttpParams().set('userId', userId);
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => this.http.post(this.baseUrl, body, { headers, params }))
    );
  }

  updateGoal(goalId: string, userId: string, body: any): Observable<any> {
    const params = new HttpParams().set('userId', userId);
    const url = `${this.baseUrl}/${goalId}`;
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => this.http.put(url, body, { headers, params }))
    );
  }

  deleteGoal(goalId: string, userId: string, mode: 'soft' | 'hard' = 'soft'): Observable<any> {
    const params = new HttpParams().set('userId', userId).set('mode', mode);
    const url = `${this.baseUrl}/${goalId}`;
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => this.http.delete(url, { headers, params }))
    );
  }
}
