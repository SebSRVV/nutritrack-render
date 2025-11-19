import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../core/supabase.service';

// DTOs para comunicación con el backend
export interface PracticeDTO {
    name: string;
    description: string;
    icon: string;
    value_kind: string;
    target_value: number;
    target_unit: string;
    practice_operator: string;
    days_per_week: number;
    is_active: boolean;
}

export interface PracticeEntryDTO {
    value: number;
    note?: string;
    achieved: boolean;
}

export interface PracticeWeekStatsDTO {
    name: string;
    days_per_week: number;
    achieved_days_last_7: number;
    logged_days_last_7: number;
}

export interface SuccessResponse {
    timestamp: string;
    code: string;
    message: string;
}

export interface ErrorResponse {
    timestamp: string;
    error: string;
    message: string;
}

@Injectable({ providedIn: 'root' })
export class PracticesService {
    private http = inject(HttpClient);
    private supabase = inject(SupabaseService);
    private baseUrl = 'http://localhost:8080/api/practices';

    /**
     * Obtiene el Bearer Token de Supabase automáticamente
     */
    private async getAuthToken(): Promise<string | null> {
        try {
            const { data, error } = await this.supabase.client.auth.getSession();
            
            if (error) {
                console.error('❌ Error obteniendo sesión:', error);
                return null;
            }

            return data.session?.access_token || null;
        } catch (err) {
            console.error('❌ Error obteniendo token:', err);
            return null;
        }
    }

    obtenerPracticas(userId: string): Observable<SuccessResponse>{
        const url = `${this.baseUrl}/${userId}`
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.get<SuccessResponse>(url, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Crea headers con el Bearer Token automáticamente
     */
    private async createAuthHeaders(): Promise<{ [key: string]: string }> {
        const token = await this.getAuthToken();
        
        const headers: { [key: string]: string } = {
            'Content-Type': 'application/json'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    // ==================== PRÁCTICAS ====================

    /**
     * Crear una nueva práctica
     */
    crearPractica(userId: string, dto: PracticeDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/crear/${userId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.post<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Editar una práctica existente
     */
    editarPractica(practiceId: string, dto: PracticeDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/editar/${practiceId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.put<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Eliminar una práctica (soft o hard delete)
     */
    eliminarPractica(practiceId: string, metodo: 'soft' | 'hard' = 'soft'): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/eliminar/${metodo}/${practiceId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.delete<SuccessResponse>(url, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    // ==================== ENTRADAS ====================

    /**
     * Crear una entrada (log) para una práctica
     */
    crearEntrada(practiceId: string, dto: PracticeEntryDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/crearentrada/${practiceId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.post<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Editar una entrada existente
     */
    editarEntrada(entryId: string, dto: PracticeEntryDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/editarentrada/${entryId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.put<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Eliminar una entrada
     */
    eliminarEntrada(entryId: string): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/borrarentrada/${entryId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.delete<SuccessResponse>(url, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    // ==================== ESTADÍSTICAS SEMANALES ====================

    /**
     * Crear estadísticas semanales
     */
    crearWeekStats(practiceId: string, dto: PracticeWeekStatsDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/crearweek/${practiceId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.post<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Editar estadísticas semanales
     */
    editarWeekStats(statsId: string, dto: PracticeWeekStatsDTO): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/editarweek/${statsId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.put<SuccessResponse>(url, dto, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    /**
     * Eliminar estadísticas semanales
     */
    eliminarWeekStats(statsId: string): Observable<SuccessResponse> {
        const url = `${this.baseUrl}/borrarweek/${statsId}`;
        
        return from(this.createAuthHeaders()).pipe(
            switchMap(headers => 
                this.http.delete<SuccessResponse>(url, { headers })
            ),
            catchError(this.handleError.bind(this))
        );
    }

    // ==================== MANEJO DE ERRORES ====================

    private handleError(error: HttpErrorResponse): Observable<never> {
        let errorMessage = 'Ha ocurrido un error desconocido';

        if (error.error instanceof ErrorEvent) {
            // Error del cliente o de red
            errorMessage = `Error: ${error.error.message}`;
        } else {
            // El backend retornó un código de error
            const backendError = error.error as ErrorResponse;
            
            if (backendError?.message) {
                errorMessage = backendError.message;
            } else if (error.status === 0) {
                errorMessage = 'No se puede conectar con el servidor. Verifica que esté ejecutándose.';
            } else if (error.status === 401) {
                errorMessage = 'No autorizado. Por favor inicia sesión nuevamente.';
            } else if (error.status === 403) {
                errorMessage = 'No tienes permisos para realizar esta acción.';
            } else if (error.status === 404) {
                errorMessage = 'Recurso no encontrado.';
            } else if (error.status === 409) {
                errorMessage = backendError?.message || 'Ya existe una entrada para esta práctica hoy.';
            } else {
                errorMessage = `Error ${error.status}: ${error.statusText}`;
            }
        }

        console.error('❌ Error en PracticesService:', error);
        return throwError(() => new Error(errorMessage));
    }
}