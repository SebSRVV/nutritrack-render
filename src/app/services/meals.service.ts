import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealResponseDto {
  id: string;
  userId: string;
  description: string;
  calories: number;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  mealType: MealType;
  loggedAt: string;
  createdAt: string;
  categoryIds: number[] | null;
}

export interface CreateMealDto {
  description: string;
  calories: number;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  mealType: MealType;
  loggedAt?: string;
  categoryIds?: number[];
}

@Injectable({ providedIn: 'root' })
export class MealsService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  listByDateRange(from: string, to: string): Observable<MealResponseDto[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<MealResponseDto[]>(`${this.baseUrl}/api/meals`, { params });
  }

  create(body: CreateMealDto): Observable<MealResponseDto> {
    return this.http.post<MealResponseDto>(`${this.baseUrl}/api/meals`, body);
  }

  delete(mealId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/meals/${mealId}`);
  }
}
