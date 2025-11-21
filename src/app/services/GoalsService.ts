import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service'; // Asegúrate de que esta ruta sea correcta

// --- Interfaces existentes ---
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
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Inyecciones modernas (más limpio que el constructor)
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService); 
  
  private base = environment.apiBaseUrl;

  // =========================================================
  // 1. TU LÓGICA ORIGINAL (Registro)
  // =========================================================
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
        throw err;
      })
    );
  }

  // =========================================================
  // 2. NUEVA LÓGICA (Para que funcione GoalsService)
  // =========================================================

  /**
   * Obtiene el token actual de Supabase para las peticiones
   */
  async getToken(): Promise<string | null> {
    try {
      const { data: { session } } = await this.supabase.client.auth.getSession();
      return session?.access_token ?? null;
    } catch (e) {
      console.error('Error obteniendo sesión:', e);
      return null;
    }
  }

  /**
   * Genera los headers con el Bearer Token para llamar al Backend Java
   */
  async getAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.getToken();
    
    if (!token) {
      // Opcional: Manejar logout o error si es estricto
      console.warn('Usuario no autenticado, no hay token.');
    }
    
    return new HttpHeaders({
      'Authorization': `Bearer ${token || ''}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Helper opcional para obtener el ID del usuario logueado
   */
  async getCurrentUserId(): Promise<string | null> {
     const { data: { session } } = await this.supabase.client.auth.getSession();
     return session?.user?.id ?? null;
  }
}