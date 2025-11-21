import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service';

export interface GoalRequest {
  goal_name: string;
  goal_description?: string;
  target_value?: number;
  target_unit?: string;
  current_value?: number;
  deadline?: string;
  is_active?: boolean;
}

export interface GoalResponse {
  id: string;
  user_id: string;
  goal_name: string;
  goal_description?: string;
  target_value?: number;
  target_unit?: string;
  current_value?: number;
  deadline?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class GoalsService {
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService);
  private baseUrl = `${environment.apiBaseUrl}/api/goals`;

  /**
   * Obtiene el token de Supabase para autenticación
   */
  private async getToken(): Promise<string | null> {
    try {
      const { data: { session } } = await this.supabase.client.auth.getSession();
      return session?.access_token ?? null;
    } catch (e) {
      console.error('Error obteniendo sesión:', e);
      return null;
    }
  }

  /**
   * Obtiene el ID del usuario actual
   */
  async getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await this.supabase.client.auth.getSession();
    return session?.user?.id ?? null;
  }

  /**
   * Crea headers con autorización
   */
  private async createAuthHeaders(): Promise<{ [key: string]: string }> {
    const token = await this.getToken();
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Lista todas las metas del usuario
   */
  listGoals(userId: string): Observable<GoalResponse[]> {
    const params = new HttpParams().set('userId', userId);
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => 
        this.http.get<GoalResponse[]>(this.baseUrl, { headers, params })
      )
    );
  }

  /**
   * Crea una nueva meta
   */
  createGoal(userId: string, body: GoalRequest): Observable<GoalResponse> {
    const params = new HttpParams().set('userId', userId);
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => 
        this.http.post<GoalResponse>(this.baseUrl, body, { headers, params })
      )
    );
  }

  /**
   * Actualiza una meta existente
   */
  updateGoal(goalId: string, userId: string, body: GoalRequest): Observable<GoalResponse> {
    const params = new HttpParams().set('userId', userId);
    const url = `${this.baseUrl}/${goalId}`;
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => 
        this.http.patch<GoalResponse>(url, body, { headers, params })
      )
    );
  }

  /**
   * Elimina una meta (soft delete por defecto)
   */
  deleteGoal(goalId: string, userId: string, mode: 'soft' | 'hard' = 'soft'): Observable<any> {
    const params = new HttpParams()
      .set('userId', userId)
      .set('mode', mode);
    const url = `${this.baseUrl}/${goalId}`;
    return from(this.createAuthHeaders()).pipe(
      switchMap(headers => 
        this.http.delete(url, { headers, params })
      )
    );
  }
}
