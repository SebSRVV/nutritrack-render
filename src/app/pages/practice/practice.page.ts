import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { PracticesService, PracticeDTO, PracticeEntryDTO } from '../../services/practices.service';
import {
  LucideAngularModule,
  HeartPulseIcon, PlusIcon, CheckIcon, Trash2Icon, RefreshCwIcon, ChevronRightIcon, EditIcon
} from 'lucide-angular';

type Suggestion = {
  id: number;
  practice_name: string;
  description: string | null;
  icon: string | null;
  frequency_target: number | null;
  sort_order: number | null;
};

type UserPractice = {
  id: string;
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
  imports: [CommonModule, LucideAngularModule, ReactiveFormsModule],
  templateUrl: './practice.page.html',
  styleUrls: ['./practice.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PracticePage {
  readonly HeartPulseIcon = HeartPulseIcon;
  readonly PlusIcon = PlusIcon;
  readonly CheckIcon = CheckIcon;
  readonly Trash2Icon = Trash2Icon;
  readonly RefreshCwIcon = RefreshCwIcon;
  readonly ChevronRightIcon = ChevronRightIcon;
  readonly EditIcon = EditIcon;

  private supabase = inject(SupabaseService);
  private practiceService = inject(PracticesService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  err = signal<string | null>(null);
  uid = signal<string | null>(null);

  suggestions = signal<Suggestion[]>([]);
  myPractices = signal<UserPractice[]>([]);
  weekly = signal<Record<string, WeekMark[]>>({});
  weeklyCount = signal<Record<string, number>>({});

  replacingId = signal<string | null>(null);
  showSuggestions = signal<boolean>(false);
  showCustomForm = signal<boolean>(false);
  editingPracticeId = signal<string | null>(null); // Nueva señal para edición

  practiceForm: FormGroup;

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

  // Computed para saber si estamos editando
  isEditing = computed(() => this.editingPracticeId() !== null);

  constructor() {
    this.practiceForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', Validators.required],
      icon: ['💡', Validators.required],
      value_kind: ['quantity', Validators.required],
      target_value: [10, [Validators.required, Validators.min(1)]],
      target_unit: ['minutes', Validators.required],
      practice_operator: ['gte', Validators.required],
      days_per_week: [7, [Validators.required, Validators.min(1), Validators.max(7)]],
    });
  }

  async ngOnInit() {
    try {
      this.loading.set(true);

      const { data: ures, error: uerr } = await this.supabase.client.auth.getUser();
      if (uerr) throw uerr;
      const uid = ures.user?.id;
      if (!uid) throw new Error('Sesion no valida');
      this.uid.set(uid);

      console.log('✅ Usuario autenticado:', uid);

      await Promise.all([
        this.loadSuggestions(),
        this.loadMyPracticesAndLogs()
      ]);
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo cargar Prácticas.');
      console.error('❌ Error en ngOnInit:', e);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSuggestions() {
    const { data, error } = await this.supabase.client
      .from('default_practices')
      .select('id, practice_name, description, icon, frequency_target, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    this.suggestions.set((data ?? []) as Suggestion[]);
  }

  private async loadMyPracticesAndLogs() {
    const uid = this.uid()!;
    
    const { data: up, error } = await this.supabase.client
      .from('practices')
      .select('id, user_id, name, description, icon, target_value, target_unit, days_per_week, is_active')
      .eq('user_id', uid)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Error cargando prácticas:', error);
      throw error;
    }

    const list = (up ?? []).map(p => ({
      id: p.id,
      user_id: p.user_id,
      practice_name: p.name,
      description: p.description,
      icon: p.icon,
      frequency_target: p.days_per_week,
      sort_order: null,
      is_active: p.is_active
    })) as UserPractice[];
    
    console.log('✅ Prácticas cargadas:', list.length);
    this.myPractices.set(list);

    if (list.length === 0) {
      console.log('ℹ️ No hay prácticas activas');
      this.weekly.set({});
      this.weeklyCount.set({});
      return;
    }

    const start = new Date(this.todayLocal());
    start.setDate(start.getDate() - 6);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = this.todayLocal().toISOString().slice(0, 10);

    const ids = list.map(p => p.id);
    
    const { data: logs, error: lerr } = await this.supabase.client
      .from('practice_logs')
      .select('practice_id, logged_date')
      .eq('user_id', uid)
      .in('practice_id', ids)
      .gte('logged_date', startIso)
      .lte('logged_date', endIso);
    
    if (lerr) {
      console.error('❌ Error cargando logs:', lerr);
      throw lerr;
    }

    console.log('✅ Logs cargados:', logs?.length ?? 0);

    const byPractice: Record<string, Record<string, boolean>> = {};
    for (const p of list) byPractice[p.id] = {};
    for (const r of (logs ?? []) as Array<{ practice_id: string; logged_date: string }>) {
      byPractice[r.practice_id][r.logged_date] = true;
    }

    const weekMarks: Record<string, WeekMark[]> = {};
    const weekCounts: Record<string, number> = {};
    for (const p of list) {
      const marks: WeekMark[] = this.weekDates().map(d => {
        const ymd = d.toISOString().slice(0, 10);
        return { date: ymd, done: !!byPractice[p.id][ymd] };
      });
      weekMarks[p.id] = marks;
      weekCounts[p.id] = marks.reduce((s, m) => s + (m.done ? 1 : 0), 0);
    }

    this.weekly.set(weekMarks);
    this.weeklyCount.set(weekCounts);
  }

  async addSuggestion(s: Suggestion) {
    try {
      this.saving.set(true);
      this.err.set(null);
      const uid = this.uid()!;
      const replacing = this.replacingId();

      const dto: PracticeDTO = {
        name: s.practice_name,
        description: s.description ?? '',
        icon: s.icon ?? '💡',
        value_kind: 'quantity',
        target_value: 1,
        target_unit: 'times',
        practice_operator: 'gte',
        days_per_week: s.frequency_target ?? 7,
        is_active: true
      };

      console.log('📤 Creando práctica:', dto);

      await new Promise<void>((resolve, reject) => {
        this.practiceService.crearPractica(uid, dto).subscribe({
          next: (response) => {
            console.log('✅ Práctica creada:', response);
            resolve();
          },
          error: (err) => {
            console.error('❌ Error:', err);
            reject(err);
          }
        });
      });

      if (replacing) {
        await this.removePractice(replacing, { silent: true });
        this.replacingId.set(null);
      }

      await this.loadMyPracticesAndLogs();
      this.closeSuggestions();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo agregar la práctica.');
      console.error('❌ Error en addSuggestion:', e);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleToday(p: UserPractice) {
    try {
      this.saving.set(true);
      this.err.set(null);
      const uid = this.uid()!;
      const today = this.todayLocal().toISOString().slice(0, 10);

      const { data: existing } = await this.supabase.client
        .from('practice_logs')
        .select('id')
        .eq('user_id', uid)
        .eq('practice_id', p.id)
        .eq('logged_date', today)
        .maybeSingle();

      if (existing?.id) {
        console.log('🗑️ Eliminando entrada:', existing.id);
        
        await new Promise<void>((resolve, reject) => {
          this.practiceService.eliminarEntrada(existing.id).subscribe({
            next: (response) => {
              console.log('✅ Entrada eliminada:', response);
              resolve();
            },
            error: (err) => {
              console.error('❌ Error:', err);
              reject(err);
            }
          });
        });
      } else {
        console.log('📝 Creando entrada para práctica:', p.id);
        
        const entryDTO: PracticeEntryDTO = {
          value: 1,
          note: 'Cumplido',
          achieved: true
        };

        await new Promise<void>((resolve, reject) => {
          this.practiceService.crearEntrada(p.id, entryDTO).subscribe({
            next: (response) => {
              console.log('✅ Entrada creada:', response);
              resolve();
            },
            error: (err) => {
              console.error('❌ Error:', err);
              
              if (err.message.includes('Ya existe una entrada')) {
                this.err.set('Ya registraste esta práctica hoy. Recarga la página.');
              }
              reject(err);
            }
          });
        });
      }

      await this.loadMyPracticesAndLogs();
    } catch (e: any) {
      if (!this.err()) {
        this.err.set(e?.message ?? 'No se pudo registrar el cumplimiento.');
      }
      console.error('❌ Error en toggleToday:', e);
    } finally {
      this.saving.set(false);
    }
  }

  async removePractice(id: string, opts: { silent?: boolean } = {}) {
    try {
      if (!opts.silent && !confirm('¿Eliminar esta práctica? Se mantendrá el historial.')) return;

      this.saving.set(true);
      this.err.set(null);

      console.log('🗑️ Eliminando práctica:', id);

      await new Promise<void>((resolve, reject) => {
        this.practiceService.eliminarPractica(id, 'soft').subscribe({
          next: (response) => {
            console.log('✅ Práctica eliminada:', response);
            resolve();
          },
          error: (err) => {
            console.error('❌ Error:', err);
            reject(err);
          }
        });
      });

      await this.loadMyPracticesAndLogs();
    } catch (e: any) {
      this.err.set(e?.message ?? 'No se pudo eliminar la práctica.');
      console.error('❌ Error en removePractice:', e);
    } finally {
      this.saving.set(false);
    }
  }

  // NUEVO: Método para abrir el panel de edición
  openEditForm(practice: UserPractice) {
    this.editingPracticeId.set(practice.id);
    this.showCustomForm.set(true);
    this.showSuggestions.set(false);
    this.err.set(null);

    // Buscar los datos originales desde la BD para obtener TODOS los campos
    const uid = this.uid()!;
    this.supabase.client
      .from('practices')
      .select('*')
      .eq('id', practice.id)
      .eq('user_id', uid)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ Error cargando práctica para editar:', error);
          this.err.set('No se pudo cargar la práctica');
          return;
        }

        // Rellenar el formulario con los datos reales de la BD
        this.practiceForm.patchValue({
          name: data.name || '',
          description: data.description || '',
          icon: data.icon || '💡',
          value_kind: data.value_kind || 'quantity',
          target_value: data.target_value || 10,
          target_unit: data.target_unit || 'minutes',
          practice_operator: data.operator || 'gte',
          days_per_week: data.days_per_week || 7,
        });

        console.log('✅ Práctica cargada para editar:', data);
      });
  }

  openSuggestions(replaceId?: string) {
    this.replacingId.set(replaceId ?? null);
    this.showSuggestions.set(true);
    this.showCustomForm.set(false);
    this.editingPracticeId.set(null);
    this.err.set(null);
  }

  openCustomForm() {
    this.editingPracticeId.set(null);
    this.showCustomForm.set(true);
    this.showSuggestions.set(false);
    this.practiceForm.reset({
      name: '',
      description: '',
      icon: '💡',
      value_kind: 'quantity',
      target_value: 10,
      target_unit: 'minutes',
      practice_operator: 'gte',
      days_per_week: 7,
    });
    this.err.set(null);
  }

  closeSuggestions() {
    this.replacingId.set(null);
    this.showSuggestions.set(false);
    this.showCustomForm.set(false);
    this.editingPracticeId.set(null);
    this.err.set(null);
  }

  iconOrFallback(i?: string | null) { 
    return i && i.trim() ? i : '💡'; 
  }
  
  countFor(id: string) { 
    return this.weeklyCount()[id] ?? 0; 
  }
  
  marksFor(id: string) { 
    return this.weekly()[id] ?? []; 
  }

  // MODIFICADO: Ahora maneja tanto creación como edición
  crearNuevaPractica() {
    if (this.practiceForm.invalid) {
      this.err.set('Por favor completa todos los campos correctamente');
      this.practiceForm.markAllAsTouched();
      return;
    }

    const uid = this.uid();
    if (!uid) {
      this.err.set('Usuario no autenticado');
      return;
    }

    const formValue = this.practiceForm.value;
    const editingId = this.editingPracticeId();

    // Si estamos editando, llamamos al método de actualización
    if (editingId) {
      this.actualizarPractica(editingId, formValue);
    } else {
      this.crearPractica(formValue, uid);
    }
  }

  // Método separado para crear
  private crearPractica(formValue: any, uid: string) {
    const dto: PracticeDTO = {
      name: formValue.name,
      description: formValue.description,
      icon: formValue.icon,
      value_kind: formValue.value_kind,
      target_value: Number(formValue.target_value),
      target_unit: formValue.target_unit,
      practice_operator: formValue.practice_operator,
      days_per_week: Number(formValue.days_per_week),
      is_active: true,
    };

    console.log('📤 Creando práctica personalizada:', dto);

    this.saving.set(true);
    this.err.set(null);

    this.practiceService.crearPractica(uid, dto).subscribe({
      next: (result) => {
        console.log('✅ Práctica creada:', result);
        this.practiceForm.reset();
        this.closeSuggestions();
        this.loadMyPracticesAndLogs();
        this.saving.set(false);
      },
      error: (err) => {
        this.err.set(err.message ?? 'Error al crear práctica');
        this.saving.set(false);
        console.error('❌ Error en crearPractica:', err);
      }
    });
  }

  // NUEVO: Método para actualizar práctica
  private actualizarPractica(practiceId: string, formValue: any) {
    console.log('📝 Actualizando práctica:', practiceId);

    this.saving.set(true);
    this.err.set(null);

    // Hacemos la actualización directa en Supabase
    this.supabase.client
      .from('practices')
      .update({
        name: formValue.name,
        description: formValue.description,
        icon: formValue.icon,
        value_kind: formValue.value_kind,
        target_value: Number(formValue.target_value),
        target_unit: formValue.target_unit,
        operator: formValue.practice_operator,
        days_per_week: Number(formValue.days_per_week),
        updated_at: new Date().toISOString()
      })
      .eq('id', practiceId)
      .eq('user_id', this.uid()!)
      .then(({ error }) => {
        if (error) {
          console.error('❌ Error actualizando:', error);
          this.err.set(error.message ?? 'Error al actualizar práctica');
          this.saving.set(false);
          return;
        }

        console.log('✅ Práctica actualizada correctamente');
        this.practiceForm.reset();
        this.closeSuggestions();
        this.loadMyPracticesAndLogs();
        this.saving.set(false);
      });
  }
}