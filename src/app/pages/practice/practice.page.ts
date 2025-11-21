import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  HeartPulseIcon, PlusIcon, CheckIcon, Trash2Icon, RefreshCwIcon, ChevronRightIcon
} from 'lucide-angular';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

type Suggestion = {
  id: number;
  practice_name: string;
  description: string | null;
  icon: string | null;
  frequency_target: number | null;
  sort_order: number | null;
};

type UserPractice = {
  id: string; // uuid
  user_id: string;
  practice_name: string;
  description: string | null;
  icon: string | null;
  frequency_target: number | null;
  sort_order: number | null;
  is_active: boolean;
};

type WeekMark = { date: string; done: boolean };

@Component({
  standalone: true,
  selector: 'nt-practices',
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './practice.page.html',
  styleUrls: ['./practice.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PracticePage {
  // Icons
  readonly HeartPulseIcon = HeartPulseIcon;
  readonly PlusIcon = PlusIcon;
  readonly CheckIcon = CheckIcon;
  readonly Trash2Icon = Trash2Icon;
  readonly RefreshCwIcon = RefreshCwIcon;
  readonly ChevronRightIcon = ChevronRightIcon;

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiBase = environment.apiBaseUrl;

  // estado base
  loading = signal(true);
  saving = signal(false);
  err = signal<string | null>(null);

  uid = signal<string | null>(null);

  // data
  suggestions = signal<Suggestion[]>([]);
  myPractices = signal<UserPractice[]>([]);

  // mapas auxiliares
  // historial semanal por práctica (últimos 7 días, hoy inclusive)
  weekly = signal<Record<string, WeekMark[]>>({});
  // conteo semanal por práctica
  weeklyCount = signal<Record<string, number>>({});

  // panel de reemplazo
  replacingId = signal<string | null>(null);
  showSuggestions = signal<boolean>(false);

  // rango de semana
  private todayLocal = computed(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  weekDates = computed(() => {
    const end = this.todayLocal();
    const arr: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      arr.push(d);
    }
    return arr;
  });

  weekLabels = computed(() =>
    this.weekDates().map(d => d.toLocaleDateString(undefined, { weekday: 'short' }))
  );

  async ngOnInit() {
    try {
      this.loading.set(true);

      // usuario
      const me = await this.auth.me().toPromise();
      const uid = me?.id;
      if (!uid) throw new Error('Sesión no válida');
      this.uid.set(uid);

      await Promise.all([
        this.loadSuggestions(),
        this.loadMyPracticesAndLogs()
      ]);
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo cargar Prácticas.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSuggestions() {
    // Sugerencias locales (frontend), ordenadas por sort_order
    const local: Suggestion[] = [
      { id: 1, practice_name: 'Dormir 7-8h', description: 'Prioriza descanso suficiente', icon: '💤', frequency_target: 7, sort_order: 1 },
      { id: 2, practice_name: 'Caminar 30min', description: 'Actividad ligera diaria', icon: '🚶‍♂️', frequency_target: 5, sort_order: 2 },
      { id: 3, practice_name: 'Frutas/Veg', description: 'Al menos 5 porciones/día', icon: '🥗', frequency_target: 7, sort_order: 3 },
      { id: 4, practice_name: 'Meditar 10min', description: 'Respira y desconecta', icon: '🧘‍♀️', frequency_target: 5, sort_order: 4 },
      { id: 5, practice_name: 'Evitar bebidas azucaradas', description: 'Reemplaza por agua', icon: '🚫🥤', frequency_target: 5, sort_order: 5 },
    ];
    this.suggestions.set(local);
  }

  private async loadMyPracticesAndLogs() {
    const uid = this.uid()!;
    // prácticas del usuario desde backend
    const list = (await this.http.get<UserPractice[]>(`${this.apiBase}/api/practices/${uid}`).toPromise()) ?? [];
    this.myPractices.set(list);

    // si no hay prácticas, reset semanal
    if (list.length === 0) {
      this.weekly.set({});
      this.weeklyCount.set({});
      return;
    }

    // construir mapa semana a partir de entradas por práctica
    const weekMarks: Record<string, WeekMark[]> = {};
    const weekCounts: Record<string, number> = {};
    for (const p of list) {
      const entries = (await this.http.get<Array<{ id: string; practiceId: string; loggedDate: string }>>(`${this.apiBase}/api/practices/entrada/${p.id}`).toPromise()) ?? [];
      const marks: WeekMark[] = this.weekDates().map(d => {
        const ymd = d.toISOString().slice(0, 10);
        const done = entries.some(e => (e as any).logged_date === ymd || (e as any).loggedDate === ymd);
        return { date: ymd, done };
      });
      weekMarks[p.id] = marks;
      weekCounts[p.id] = marks.reduce((s, m) => s + (m.done ? 1 : 0), 0);
    }

    this.weekly.set(weekMarks);
    this.weeklyCount.set(weekCounts);
  }

  // añadir desde sugerencias (o reemplazo)
  async addSuggestion(s: Suggestion) {
    try {
      this.saving.set(true);
      const uid = this.uid()!;
      // si es reemplazo, guardamos y eliminamos la anterior
      const replacing = this.replacingId();
      await this.http.post(`${this.apiBase}/api/practices/crear/${uid}`, {
        practice_name: s.practice_name,
        description: s.description,
        icon: s.icon,
        frequency_target: s.frequency_target ?? 7,
        sort_order: s.sort_order ?? 999,
        is_active: true,
      }).toPromise();

      if (replacing) {
        await this.removePractice(replacing, { silent: true });
        this.replacingId.set(null);
      }

      await this.loadMyPracticesAndLogs();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo agregar la práctica.');
    } finally {
      this.saving.set(false);
    }
  }

  // marcar / desmarcar cumplimiento para HOY
  async toggleToday(p: UserPractice) {
    try {
      this.saving.set(true);
      const today = this.todayLocal().toISOString().slice(0, 10);
      const entries = (await this.http.get<Array<{ id: string; loggedDate: string }>>(`${this.apiBase}/api/practices/entrada/${p.id}`).toPromise()) ?? [];
      const existing = entries.find(e => (e as any).logged_date === today || (e as any).loggedDate === today);
      if (existing?.id) {
        await this.http.delete(`${this.apiBase}/api/practices/borrarentrada/${existing.id}`).toPromise();
      } else {
        await this.http.post(`${this.apiBase}/api/practices/crearentrada/${p.id}`, { logged_date: today }).toPromise();
      }

      await this.loadMyPracticesAndLogs();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo registrar el cumplimiento.');
    } finally {
      this.saving.set(false);
    }
  }

  // eliminar (desactivar) práctica
  async removePractice(id: string, opts: { silent?: boolean } = {}) {
    try {
      if (!opts.silent && !confirm('¿Eliminar esta práctica? Se mantendrá el historial.')) return;
      await this.http.delete(`${this.apiBase}/api/practices/eliminar/soft/${id}`).toPromise();

      await this.loadMyPracticesAndLogs();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo eliminar la práctica.');
    }
  }

  // abrir/cerrar panel de sugerencias (para nuevo o reemplazo)
  openSuggestions(replaceId?: string) {
    this.replacingId.set(replaceId ?? null);
    this.showSuggestions.set(true);
  }
  closeSuggestions() {
    this.replacingId.set(null);
    this.showSuggestions.set(false);
  }

  // helpers de UI
  iconOrFallback(i?: string | null) { return i && i.trim() ? i : '💡'; }
  countFor(id: string) { return this.weeklyCount()[id] ?? 0; }
  marksFor(id: string) { return this.weekly()[id] ?? []; }
}
