import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

import { SupabaseService } from '../../core/supabase.service';
import { environment } from '../../../environments/environment';

import {
  LucideAngularModule,
  ActivityIcon,
  TargetIcon,
  DropletsIcon,
  HeartPulseIcon,
  ChevronRightIcon,
  UtensilsCrossedIcon,
  SettingsIcon
} from 'lucide-angular';
import { AuthService } from '../../services/auth.service';

type Sex = 'FEMALE' | 'MALE';
type ActivityLevel = 'sedentary' | 'moderate' | 'very_active';
type DietType = 'low_carb' | 'caloric_deficit' | 'surplus';

@Component({
  standalone: true,
  selector: 'nt-dashboard',
  imports: [CommonModule, RouterLink, LucideAngularModule, HttpClientModule],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class DashboardPage {
  // Icons
  readonly ActivityIcon = ActivityIcon;
  readonly TargetIcon = TargetIcon;
  readonly UtensilsCrossedIcon = UtensilsCrossedIcon;
  readonly DropletsIcon = DropletsIcon;
  readonly HeartPulseIcon = HeartPulseIcon;
  readonly ChevronRightIcon = ChevronRightIcon;
  readonly SettingsIcon = SettingsIcon;

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiBase = environment.apiBaseUrl;
  private supabase = inject(SupabaseService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Estado base
  loading = signal(true);
  err = signal<string | null>(null);

  // Perfil
  uid = signal<string | null>(null);
  sex = signal<Sex>('FEMALE');
  height = signal<number | null>(null);
  weight = signal<number | null>(null);
  dob = signal<string | null>(null);
  activity = signal<ActivityLevel>('moderate');
  diet = signal<DietType>('caloric_deficit');

  // Totales del día
  todayMeals = signal<number>(0);
  todayKcal = signal<number>(0);
  waterMl = signal<number>(0);

  // Recomendaciones (DB o fallback)
  recKcal = signal<number | null>(null);
  recWater = signal<number | null>(null);

  // Metas (conteo + muestra) — desde backend Spring
  goalsCount = signal(0); // SOLO metas activas
  goalsSample = signal<Array<{ id: string; title: string; status: string }>>([]);

  // ---------- Computados ----------
  private ageYears = computed(() => {
    const s = this.dob();
    if (!s) return null;
    const d = new Date(s);
    const t = new Date();
    let a = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
    return Math.max(a, 0);
  });

  bmi = computed(() => {
    const h = this.height(), w = this.weight();
    if (!h || !w) return null;
    const meters = h / 100;
    return +(w / (meters * meters)).toFixed(1);
  });

  bmiLabel = computed(() => {
    const v = this.bmi();
    if (v === null) return '—';
    if (v < 18.5) return 'Bajo peso';
    if (v < 25) return 'Saludable';
    if (v < 30) return 'Sobrepeso';
    return 'Obesidad';
  });

  waterPct = computed(() => {
    const goal = this.recWater();
    const ml = this.waterMl();
    if (!goal || goal <= 0) return 0;
    const pct = (ml / goal) * 100;
    return pct > 100 ? 100 : pct < 0 ? 0 : +pct.toFixed(1);
  });

  // % progreso de alimentación (kcal)
  foodPct = computed(() => {
    const goal = this.recKcal();
    const v = this.todayKcal();
    if (!goal || goal <= 0) return 0;
    const p = (v / goal) * 100;
    return Math.max(0, Math.min(100, +p.toFixed(1)));
  });

  // ---------- Helpers (fallback de recomendaciones) ----------
  private activityFactor(a: ActivityLevel): number {
    switch (a) {
      case 'sedentary': return 1.2;
      case 'moderate': return 1.55;
      case 'very_active': return 1.725;
      default: return 1.2;
    }
  }

  private kcalAdj(d: DietType): number {
    switch (d) {
      case 'caloric_deficit': return 0.85; // -15%
      case 'surplus': return 1.10;         // +10%
      default: return 1.00;                // low_carb no ajusta kcal
    }
  }

  private waterFactorByAge(age: number): number {
    if (age < 30) return 35;      // ml/kg
    if (age <= 55) return 33;
    return 30;
  }

  private activityWaterBonus(a: ActivityLevel): number {
    if (a === 'moderate') return 500;
    if (a === 'very_active') return 1000;
    return 0;
  }

  private recomputeLocalRecommendations(): { kcal: number | null; water: number | null } {
    const h = this.height(), w = this.weight(), s = this.sex(), a = this.activity(), d = this.diet(), age = this.ageYears();
    if (!h || !w || !s || age === null) return { kcal: null, water: null };

    // BMR (Mifflin-St Jeor)
    const bmr = s === 'MALE'
      ? 10 * w + 6.25 * h - 5 * age + 5
      : 10 * w + 6.25 * h - 5 * age - 161;

    const tdee = bmr * this.activityFactor(a);
    const kcal = Math.round(tdee * this.kcalAdj(d));

    const base = this.waterFactorByAge(age) * w;
    const water = Math.max(1500, Math.round(base + this.activityWaterBonus(a)));

    return { kcal, water };
  }

  // ---------- Token para backend Spring (como en GoalsPage) ----------
  private async getToken(): Promise<string | null> {
    try {
      const { data: { session } } = await this.supabase.client.auth.getSession();
      return session?.access_token ?? null;
    } catch (e) {
      console.error('Error obteniendo sesión de Supabase:', e);
      return null;
    }
  }

  private get goalsApiUrl() {
    return `${environment.apiBaseUrl}/api/goals`;
  }

  private async loadGoalsFromBackend(uid: string) {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Usuario no autenticado o sesión expirada.');
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const url = `${this.goalsApiUrl}?userId=${uid}`;

    try {
      const rows: any[] = await lastValueFrom(
        this.http.get<any[]>(url, { headers })
      );

      const allGoals = rows ?? [];

      // Filtramos solo metas activas (is_active === true)
      const active = allGoals.filter((g: any) => !!g.is_active);

      // Contador para el KPI
      this.goalsCount.set(active.length);

      // Ordenamos por created_at descendente y tomamos 3 para la lista
      active.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      this.goalsSample.set(
        active.slice(0, 3).map((g: any) => ({
          id: g.id,
          title: g.goal_name ?? 'Meta sin título',
          status: g.is_active ? 'Activa' : 'Inactiva'
        }))
      );

    } catch (e: any) {
      let message = 'No se pudieron cargar las metas del dashboard.';
      if (e instanceof HttpErrorResponse && e.error && e.error.message) {
        message = e.error.message;
      }
      // No reviento toda la pantalla, solo muestro error general abajo
      this.err.set(message);
    }
  }

  // ---------- Carga ----------
  async ngOnInit() {
    if (!this.isBrowser) {
      this.loading.set(false);
      return;
    }
    try {
      this.loading.set(true);

      // Perfil base desde backend
      const me = await this.auth.me().toPromise();
      if (!me?.id) throw new Error('Sesión no válida');
      const uid = me.id; this.uid.set(uid);

      this.sex.set((me?.sex ?? 'FEMALE') as Sex);
      this.dob.set(me?.dob ?? null);
      this.height.set(me?.height_cm ?? null);
      this.weight.set(me?.weight_kg ?? null);
      this.activity.set((me?.activity_level ?? 'moderate') as ActivityLevel);
      this.diet.set((me?.diet_type ?? 'caloric_deficit') as DietType);

      // Recomendaciones: calcula localmente con datos del perfil
      const f = this.recomputeLocalRecommendations();
      this.recKcal.set(f.kcal);
      this.recWater.set(f.water);

      // Ventana de hoy (local)
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 1);

      // Comidas de hoy
      const { data: meals } = await this.supabase.client
        .from('meal_logs')
        .select('calories')
        .eq('user_id', uid)
        .gte('logged_at', start.toISOString())
        .lt('logged_at', end.toISOString());

      this.todayMeals.set(meals?.length ?? 0);
      this.todayKcal.set(
        (meals ?? []).reduce(
          (s: number, m: any) => s + (Number(m.calories) || 0),
          0
        )
      );

      // Agua de hoy (Supabase)
      const { data: waters } = await this.supabase.client
        .from('water_intake')
        .select('amount_ml')
        .eq('user_id', uid)
        .gte('logged_at', start.toISOString())
        .lt('logged_at', end.toISOString());

      this.waterMl.set(
        (waters ?? []).reduce(
          (s: number, r: any) => s + (Number(r.amount_ml) || 0),
          0
        )
      );

      // Metas desde backend Spring
      await this.loadGoalsFromBackend(uid);

    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo cargar el dashboard.');
    } finally {
      this.loading.set(false);
    }
  }
}

