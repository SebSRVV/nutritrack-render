import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface UserProfile { id: string; email: string; username?: string | null; sex?: 'FEMALE'|'MALE'|null; height_cm?: number|null; weight_kg?: number|null; dob?: string|null; }

@Injectable({ providedIn: 'root' })
export class UsersService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/api/auth/me`);
  }
}
