// src/app/pages/goals/goals.page.ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  HttpClient,
  HttpClientModule,
  HttpErrorResponse,
} from '@angular/common/http';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import {
  LucideAngularModule,
  TrophyIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon, 
  TargetIcon,
  Settings2Icon,
  ListChecksIcon,
  SaveIcon,
  XIcon,
  Trash2Icon,
} from 'lucide-angular';
import { lastValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SupabaseService } from '../../core/supabase.service';

/** ===== Tipos ===== */
type Goal = {
  id: string;
  goal_name: string;
  description: string | null;
  weekly_target: number;
  is_active: boolean;
  category_id: number | null;
  value_type: string | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  target_value: number | null;
  created_at: string;
  updated_at: string;
};

function startOfWeekMonday(d0: Date): Date {
  const d = new Date(d0);
  const day = d.getDay(); // 0–6
  const diff = day === 0 ? -6 : 1 - day; // lunes como inicio
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const fmtRange = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
});

function endOfWeekSunday(d0: Date): Date {
  const s = startOfWeekMonday(d0);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

@Component({
  standalone: true,
  selector: 'nt-goals',
  imports: [CommonModule, LucideAngularModule, HttpClientModule],
  templateUrl: './goals.page.html',
  styleUrls: ['./goals.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('page', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate(
          '220ms cubic-bezier(.2,.8,.2,1)',
          style({ opacity: 1, transform: 'none' }),
        ),
        query(
          '.card',
          [
            style({ opacity: 0, transform: 'translateY(4px) scale(.98)' }),
            stagger(
              18,
              animate(
                '200ms cubic-bezier(.2,.8,.2,1)',
                style({ opacity: 1, transform: 'none' }),
              ),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
  ],
})
export class GoalsPage {
  // Icons
  readonly TrophyIcon = TrophyIcon;
  readonly CalendarDaysIcon = CalendarDaysIcon;
  readonly ChevronLeftIcon = ChevronLeftIcon;
  readonly ChevronRightIcon = ChevronRightIcon;
  readonly TargetIcon = TargetIcon;
  readonly Settings2Icon = Settings2Icon;
  readonly ListChecksIcon = ListChecksIcon;
  readonly SaveIcon = SaveIcon;
  readonly XIcon = XIcon;
  readonly Trash2Icon = Trash2Icon;

  // Inyecciones
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly supabase = inject(SupabaseService);

  // ===== Estado base =====
  loading = signal(true);
  err = signal<string | null>(null);

  // TODO: reemplazar por el uid real cuando enganches auth
  uid = signal<string | null>('2a8091bb-cc76-4bea-8369-1cc60c1258ad');

  goals = signal<Goal[]>([]);

  // Estado UI
  saving = signal(false);
  uiNewGoalOpen = signal(false);
  uiEditGoalId = signal<string | null>(null);

  // Navegación de Calendario
  viewDate = signal(new Date());

  // Mapa de colores para consistencia
  private colorMap = new Map<string, number>();

  // Errores de campos
  titleError = signal<string | null>(null);
  weeklyError = signal<string | null>(null);
  dateError = signal<string | null>(null);

  // Form
  form = signal<{
    title: string;
    description: string;
    target_per_week: number;
    start_date: string | null;
    end_date: string | null;
  }>({
    title: '',
    description: '',
    target_per_week: 5,
    start_date: null,
    end_date: null,
  });

  // ===== Computados y helpers =====

  weekRangeLabel = computed(() => {
    const { start, end } = this.getWeekRange(new Date());
    return `${fmtRange.format(start)} — ${fmtRange.format(end)}`;
  });

  // Etiqueta del mes (basado en viewDate)
  currentMonthLabel = computed(() => {
    const d = this.viewDate();
    const label = new Intl.DateTimeFormat('es-PE', {
      month: 'long',
      year: 'numeric',
    }).format(d);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  showEmpty = computed(() => !this.loading() && this.goals().length === 0);

  trackByGoal = (_: number, g: Goal) => g.id;

  // Etiquetas de la cabecera del calendario mensual
  weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // Días del mes actual (42 celdas = 6 filas * 7 columnas)
  monthDays = computed(() => {
    const currentView = this.viewDate();
    const firstOfMonth = new Date(
      currentView.getFullYear(),
      currentView.getMonth(),
      1,
    );
    const startGrid = startOfWeekMonday(firstOfMonth);

    // Para marcar el día 
    const realToday = new Date();

    const days: { date: Date; inMonth: boolean; isToday: boolean }[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + i);

      const inMonth = d.getMonth() === firstOfMonth.getMonth();
      const isToday =
        d.getFullYear() === realToday.getFullYear() &&
        d.getMonth() === realToday.getMonth() &&
        d.getDate() === realToday.getDate();

      days.push({ date: d, inMonth, isToday });
    }

    return days;
  });

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.uiNewGoalOpen()) {
      e.preventDefault();
      this.uiNewGoalOpen.set(false);
    }
  }

  private getWeekRange(date: Date) {
    return { start: startOfWeekMonday(date), end: endOfWeekSunday(date) };
  }

  // ===== Funciones de Calendario y Colores =====
  changeMonth(delta: number) {
    const current = this.viewDate();
    const next = new Date(
      current.getFullYear(),
      current.getMonth() + delta,
      1,
    );
    this.viewDate.set(next);
  }

  // Asignar color consistente a cada meta
  getGoalColorClass(goal: Goal): string {
    const key = goal.id;

    // Si ya tiene color asignado, lo usamos
    if (this.colorMap.has(key)) {
      return `pill-${this.colorMap.get(key)}`;
    }

    // Si es nueva, asignamos el siguiente en la rueda (0-11)
    const nextIndex = this.colorMap.size % 12;
    this.colorMap.set(key, nextIndex);

    return `pill-${nextIndex}`;
  }

  // -------------------------------------------------------------
  // Token de Supabase
  // -------------------------------------------------------------
  private async getToken(): Promise<string | null> {
    try {
      const {
        data: { session },
      } = await this.supabase.client.auth.getSession();
      return session?.access_token ?? null;
    } catch (e) {
      console.error('Error obteniendo sesión de Supabase:', e);
      return null;
    }
  }

  private async authHeaders() {
    const token = await this.getToken();
    if (!token) throw new Error('Usuario no autenticado o sesión expirada.');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private get apiUrl() {
    return `${environment.apiBaseUrl}/api/goals`;
  }

  // ===== Ciclo =====
  async ngOnInit() {
    try {
      this.loading.set(true);
      await this.loadGoalsAndProgress();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo cargar Metas.');
    } finally {
      this.loading.set(false);
    }
  }

  // ===== Datos (listar metas) =====
  private async loadGoalsAndProgress() {
    const uid = this.uid();
    if (!uid) return;

    const headers = await this.authHeaders();
    const goalListUrl = `${this.apiUrl}?userId=${uid}`;

    try {
      const rows: any[] = await lastValueFrom(
        this.http.get<any[]>(goalListUrl, { headers }),
      );

      const list: Goal[] = (rows ?? []).map((g: any) => ({
        id: g.id,
        goal_name: g.goal_name ?? '',
        description: g.description ?? null,
        weekly_target: Number(g.weekly_target ?? 1),
        is_active: g.is_active ?? true,
        category_id: g.category_id ?? null,
        value_type: g.value_type ?? null,
        unit: g.unit ?? null,
        start_date: g.start_date ?? null,
        end_date: g.end_date ?? null,
        target_value: g.target_value ?? null,
        created_at: g.created_at,
        updated_at: g.updated_at,
      }));

      this.goals.set(list);
    } catch (gErr: any) {
      let errorMessage =
        'Error al cargar metas. Verifique sesión o permisos.';
      if (
        gErr instanceof HttpErrorResponse &&
        gErr.error &&
        gErr.error.message
      ) {
        errorMessage = gErr.error.message;
      }
      throw new Error(errorMessage);
    }
  }

  // ===== Builders =====
  private buildRequestFromGoal(g: Goal): any {
    return {
      goal_name: g.goal_name,
      description: g.description,
      weekly_target: g.weekly_target,
      is_active: g.is_active,
      category_id: g.category_id,
      value_type: g.value_type,
      unit: g.unit,
      start_date: g.start_date,
      end_date: g.end_date,
      target_value: g.target_value,
    };
  }

  private buildRequestFromForm(isCreating: boolean, original?: Goal): any {
    const f = this.form();
    const title = f.title.trim();
    const desc = f.description.trim();

    let weekly = Number(f.target_per_week);
    if (!Number.isFinite(weekly)) weekly = 1;
    weekly = Math.min(7, Math.max(1, weekly));

    const baseActive = isCreating ? true : original?.is_active ?? true;

    return {
      goal_name: title,
      description: desc || null,
      weekly_target: weekly,
      is_active: baseActive,
      category_id: original?.category_id ?? null,
      value_type: original?.value_type ?? null,
      unit: original?.unit ?? null,
      start_date: f.start_date,
      end_date: f.end_date,
      target_value: original?.target_value ?? null,
    };
  }

  // ===== UI helpers =====
  openEdit(g: Goal) {
    this.titleError.set(null);
    this.weeklyError.set(null);
    this.dateError.set(null);
    this.err.set(null);

    this.form.set({
      title: g.goal_name,
      description: g.description ?? '',
      target_per_week: g.weekly_target,
      start_date: g.start_date,
      end_date: g.end_date,
    });
    this.uiEditGoalId.set(g.id);
    this.uiNewGoalOpen.set(true);
  }

  openCreate() {
    this.titleError.set(null);
    this.weeklyError.set(null);
    this.dateError.set(null);
    this.err.set(null);

    this.form.set({
      title: '',
      description: '',
      target_per_week: 5,
      start_date: null,
      end_date: null,
    });
    this.uiEditGoalId.set(null);
    this.uiNewGoalOpen.set(true);
  }

  // ===== Crear / actualizar meta =====
  async saveGoal() {
    const uid = this.uid();
    if (!uid) return;

    // reset errores
    this.titleError.set(null);
    this.weeklyError.set(null);
    this.dateError.set(null);
    this.err.set(null);

    const f = this.form();
    const trimmedTitle = f.title.trim();
    const weekly = Number(f.target_per_week);

    let hasError = false;

    // Título requerido
    if (!trimmedTitle) {
      this.titleError.set('Ponle un título a tu meta.');
      hasError = true;
    }

    // Objetivo semanal entre 1 y 7
    if (!Number.isFinite(weekly) || weekly < 1 || weekly > 7) {
      this.weeklyError.set('El objetivo semanal debe estar entre 1 y 7.');
      hasError = true;
    }

    // Rango de fechas obligatorio y válido
    if (!f.start_date || !f.end_date) {
      this.dateError.set('Selecciona una fecha de inicio y una fecha de fin.');
      hasError = true;
    } else {
      const s = new Date(f.start_date);
      const e = new Date(f.end_date);
      if (s > e) {
        this.dateError.set(
          'La fecha de inicio no puede ser posterior a la fecha de fin.',
        );
        hasError = true;
      }
    }

    if (hasError) return;

    const goalId = this.uiEditGoalId();
    const isCreating = goalId === null;

    // Meta original si estamos editando
    const original = !isCreating
      ? this.goals().find((x) => x.id === goalId) ?? undefined
      : undefined;

    const payload = this.buildRequestFromForm(isCreating, original);

    const headers = await this.authHeaders();

    try {
      this.saving.set(true);

      let url: string;
      let method: 'POST' | 'PUT';

      if (isCreating) {
        url = `${this.apiUrl}?userId=${uid}`;
        method = 'POST';
      } else {
        url = `${this.apiUrl}/${goalId}?userId=${uid}`;
        method = 'PUT';
      }

      await lastValueFrom(
        this.http.request(method, url, { body: payload, headers }),
      );

      this.uiNewGoalOpen.set(false);
      this.uiEditGoalId.set(null);
      await this.loadGoalsAndProgress();
    } catch (e: any) {
      let errorMessage = 'Error al procesar la meta.';
      if (
        e instanceof HttpErrorResponse &&
        e.error &&
        typeof e.error === 'object' &&
        e.error.message
      ) {
        errorMessage = e.error.message;
      }
      this.err.set(errorMessage);
    } finally {
      this.saving.set(false);
    }
  }

  // ===== Eliminar meta (HARD DELETE para que no reaparezca) =====
  async deleteGoal(g: Goal) {
    const uid = this.uid();
    if (!uid) return;

    const confirmDelete = window.confirm(
      `¿Eliminar la meta "${g.goal_name}"?`,
    );
    if (!confirmDelete) return;

    let headers;
    try {
      headers = await this.authHeaders();
    } catch {
      this.err.set('Sesión expirada. Inicie sesión.');
      return;
    }

    // IMPORTANTE: mode=hard para borrar de la base de datos
    const deleteUrl = `${this.apiUrl}/${g.id}?userId=${uid}&mode=hard`;

    const snapshot = this.goals();
    // UI optimista
    this.goals.set(snapshot.filter((x) => x.id !== g.id));

    try {
      await lastValueFrom(this.http.delete(deleteUrl, { headers }));
    } catch (e: any) {
      // revertir en caso de error
      this.goals.set(snapshot);

      let errorMessage = 'No se pudo eliminar la meta.';
      if (
        e instanceof HttpErrorResponse &&
        e.error &&
        typeof e.error === 'object' &&
        e.error.message
      ) {
        errorMessage = e.error.message;
      }
      this.err.set(errorMessage);
    }
  }

  /** Toggle Activo/Inactivo usando PUT con GoalRequest completo */
  async toggleActiveSwitch(g: Goal) {
    const uid = this.uid();
    if (!uid) return;

    const next = !g.is_active;
    const snapshot = this.goals();

    // UI optimista
    this.goals.set(
      snapshot.map((x) => (x.id === g.id ? { ...x, is_active: next } : x)),
    );

    let headers;
    try {
      headers = await this.authHeaders();
    } catch {
      this.err.set('Sesión expirada. Inicie sesión.');
      this.goals.set(snapshot);
      return;
    }

    const updateUrl = `${this.apiUrl}/${g.id}?userId=${uid}`;
    const updatedGoal: Goal = { ...g, is_active: next };
    const payload = this.buildRequestFromGoal(updatedGoal);

    try {
      await lastValueFrom(this.http.put(updateUrl, payload, { headers }));
    } catch (e: any) {
      this.goals.set(snapshot); // revertir

      let errorMessage = 'No se pudo cambiar el estado.';
      if (
        e instanceof HttpErrorResponse &&
        e.error &&
        typeof e.error === 'object' &&
        e.error.message
      ) {
        errorMessage = e.error.message;
      }
      this.err.set(errorMessage);
    }
  }

  /** Meta activa en un día concreto del calendario (semana/mes) */
  goalActiveOn(g: Goal, day: Date): boolean {
    // Mostramos la meta aunque esté inactiva, pero se verá tachada visualmente
    // Si quieres ocultarla del todo si es inactiva, descomenta la siguiente línea:
    // if (!g.is_active) return false;

    const d = new Date(day);
    d.setHours(0, 0, 0, 0);

    if (g.start_date) {
      const s = new Date(g.start_date);
      s.setHours(0, 0, 0, 0);
      if (d < s) return false;
    }

    if (g.end_date) {
      const e = new Date(g.end_date);
      e.setHours(0, 0, 0, 0);
      if (d > e) return false;
    }

    // si no tiene fechas, la consideramos siempre activa
    return true;
  }

  backToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
//done
