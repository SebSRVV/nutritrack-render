import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  UserIcon, MailIcon, CalendarIcon, RulerIcon, ScaleIcon, HeartPulseIcon,
  LogOutIcon, SaveIcon, InfoIcon, Trash2Icon, ShieldAlertIcon, IdCardIcon, ActivityIcon
} from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../core/supabase.service';

type Sex = 'FEMALE' | 'MALE';
type ActivityLevel = 'sedentary' | 'moderate' | 'very_active';
type DietType = 'low_carb' | 'caloric_deficit' | 'surplus';

function calcAge(dobStr?: string): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return Math.max(age, 0);
}
function daysUntilBirthday(dobStr?: string): number | null {
  if (!dobStr) return null;
  const today = new Date();
  const dob = new Date(dobStr);
  const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  const next = thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
  return Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

@Component({
  standalone: true,
  selector: 'nt-profile',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class ProfilePage {
  Math = Math;

  // Icons
  readonly UserIcon = UserIcon;
  readonly MailIcon = MailIcon;
  readonly CalendarIcon = CalendarIcon;
  readonly RulerIcon = RulerIcon;
  readonly ScaleIcon = ScaleIcon;
  readonly HeartPulseIcon = HeartPulseIcon;
  readonly LogOutIcon = LogOutIcon;
  readonly SaveIcon = SaveIcon;
  readonly InfoIcon = InfoIcon;
  readonly Trash2Icon = Trash2Icon;
  readonly ShieldAlertIcon = ShieldAlertIcon;
  readonly IdCardIcon = IdCardIcon;
  readonly ActivityIcon = ActivityIcon;

  private fb = inject(NonNullableFormBuilder);
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // UI state
  loading = signal(true);
  saving  = signal(false);
  deleting = signal(false);
  serverError = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Auth basics (email/last sign in para la cabecera)
  email   = signal<string>('');
  userId  = signal<string>('');
  createdAt = signal<string>('');
  lastSignInAt = signal<string>('');

  // Datos del perfil
  username = signal<string>('');
  sex = signal<Sex>('FEMALE');
  dob  = signal<string>('');

  activityLevel = signal<ActivityLevel>('moderate');
  dietType = signal<DietType>('caloric_deficit');

  form = this.fb.group({
    height_cm: this.fb.control(170, { validators: [Validators.required, Validators.min(80), Validators.max(230)] }),
    weight_kg: this.fb.control(70,  { validators: [Validators.required, Validators.min(25), Validators.max(250)] }),
  });

  private hCtrl = this.form.controls.height_cm;
  private wCtrl = this.form.controls.weight_kg;

  heightVal = signal<number>(this.hCtrl.value);
  weightVal = signal<number>(this.wCtrl.value);

  age = computed(() => calcAge(this.dob() || undefined));
  daysToBday = computed(() => daysUntilBirthday(this.dob() || undefined));
  heightPct = computed(() => Math.round(((this.heightVal() - 80) / (230 - 80)) * 100));
  weightPct = computed(() => Math.round(((this.weightVal() - 25) / (250 - 25)) * 100));

  bmi = computed(() => {
    const h = this.heightVal();
    const w = this.weightVal();
    if (!h || !w) return null;
    const meters = h / 100;
    return +(w / (meters * meters)).toFixed(1);
  });
  bmiStatus = computed(() => {
    const v = this.bmi();
    if (v === null) return { label: '—', color: 'muted' as const };
    if (v < 18.5)  return { label: 'Bajo peso',   color: 'amber' as const };
    if (v < 25)    return { label: 'Saludable',   color: 'green' as const };
    if (v < 30)    return { label: 'Sobrepeso',   color: 'cyan'  as const };
    return { label: 'Obesidad', color: 'violet' as const };
  });

  showDeleteModal = signal(false);
  confirmText = signal('');

  constructor() {
    // Sync slider -> signals
    this.hCtrl.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.heightVal.set(v));
    this.wCtrl.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.weightVal.set(v));

    // Clamp manual
    effect(() => {
      const h = this.heightVal();
      if (h < 80) this.hCtrl.setValue(80, { emitEvent: false });
      if (h > 230) this.hCtrl.setValue(230, { emitEvent: false });
      const w = this.weightVal();
      if (w < 25) this.wCtrl.setValue(25, { emitEvent: false });
      if (w > 250) this.wCtrl.setValue(250, { emitEvent: false });
    });

    if (this.isBrowser) {
      this.init();
    } else {
      this.loading.set(false);
    }
  }

  // ==== DATA ====
  private async init() {
    try {
      this.loading.set(true);

      // 1) auth info desde backend (email + id)
      const me = await this.auth.me().toPromise();
      if (!me) {
        await this.router.navigate(['/login'], { queryParams: { auth: 'required', redirect: '/profile' } });
        return;
      }
      this.userId.set(me.id ?? '');
      this.email.set(me.email ?? '');
      // createdAt/lastSignInAt pueden no venir del backend; déjalos en blanco si no existen
      this.createdAt.set(me.created_at ?? '');
      this.lastSignInAt.set(me.last_sign_in_at ?? '');

      // 2) perfil desde Supabase (como antes)
      const uid = me.id;
      let profileRow: any = null;
      if (uid) {
        // Esquema: profiles.id referencia auth.users(id). No existe user_id.
        const q1 = await this.supabase.client.from('profiles').select('*').eq('id', uid).maybeSingle();
        if (q1.data) profileRow = q1.data;
      }

      // set defaults si no hay fila
      const username = profileRow?.username ?? '';
      const sexRaw = (profileRow?.sex ?? 'FEMALE') as string;
      const sexUp = (sexRaw || '').toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE';
      const dob = profileRow?.dob ?? '';
      const height_cm = Number(profileRow?.height_cm ?? 170);
      const weight_kg = Number(profileRow?.weight_kg ?? 70);
      const activity = profileRow?.activity_level ?? 'moderate';
      const diet = profileRow?.diet_type ?? 'caloric_deficit';

      this.username.set(username);
      this.sex.set(sexUp as Sex);
      this.dob.set(dob);
      this.form.patchValue({ height_cm, weight_kg }, { emitEvent: true });
      this.heightVal.set(height_cm);
      this.weightVal.set(weight_kg);
      this.activityLevel.set(activity);
      this.dietType.set(diet);
    } catch (e: any) {
      this.serverError.set(e?.message ?? 'No se pudo cargar tu perfil.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfile() { return; }

  setActivity(v: ActivityLevel){ this.activityLevel.set(v); }
  setDiet(v: DietType){ this.dietType.set(v); }

  async save() {
    this.serverError.set(null);
    this.successMessage.set(null);

    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);

    const v = this.form.getRawValue();

    try {
      const uid = this.userId();
      const payload: any = {
        username: this.username(),
        // Persistir en minúsculas por CHECK (female|male)
        sex: (this.sex() === 'MALE' ? 'male' : 'female'),
        dob: this.dob(),
        height_cm: v.height_cm,
        weight_kg: v.weight_kg,
        dob: this.dob() || undefined,
        activity_level: this.activityLevel(),
        diet_type: this.dietType()
      };

      // upsert en Supabase por id; si no existe, inserta (sin user_id)
      let updated = false;
      if (uid) {
        const up1 = await this.supabase.client.from('profiles').update(payload).eq('id', uid).select('id');
        updated = (up1.data?.length ?? 0) > 0;
        if (!updated) {
          await this.supabase.client.from('profiles').insert([{ ...payload, id: uid }]);
        }
      }

      this.successMessage.set('Cambios guardados correctamente.');
      if (this.isBrowser) {
        await this.init();
      }
    } catch (e: any) {
      this.serverError.set(e?.message ?? 'No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }

  // ==== MODAL ELIMINAR / LOGOUT ====
  openDeleteModal() { this.confirmText.set(''); this.showDeleteModal.set(true); this.serverError.set(null); this.successMessage.set(null); }
  closeDeleteModal() { this.showDeleteModal.set(false); }

  async deleteAccount() {
    if (this.confirmText().toLowerCase() !== 'eliminar') return;
    this.deleting.set(true);
    this.serverError.set(null);
    try {
      await this.auth.deleteAccount(true).toPromise();
      this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch (e: any) {
      this.serverError.set(e?.message ?? 'No se pudo eliminar la cuenta.');
    } finally {
      this.deleting.set(false);
      this.showDeleteModal.set(false);
    }
  }

  async logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}

