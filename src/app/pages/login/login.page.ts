import { ChangeDetectionStrategy, Component, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeftIcon, MailIcon, LockIcon } from 'lucide-angular';
import { trigger, transition, style, animate, query, stagger, group } from '@angular/animations';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  standalone: true,
  selector: 'nt-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('page', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        query('.card', style({ opacity: 0, transform: 'translateY(12px) scale(.98)' }), { optional: true }),
        group([
          animate('420ms cubic-bezier(.16,1,.3,1)', style({ opacity: 1, transform: 'none' })),
          query('.card', [
            stagger(80, animate('380ms cubic-bezier(.16,1,.3,1)', style({ opacity: 1, transform: 'none' })))
          ], { optional: true })
        ])
      ])
    ])
  ]
})
export default class LoginPage {
  readonly ArrowLeftIcon = ArrowLeftIcon;
  readonly MailIcon = MailIcon;
  readonly LockIcon = LockIcon;

  private fb = inject(NonNullableFormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private supabase = inject(SupabaseService);

  animReady = signal(false);
  submitting = signal(false);
  serverError = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  form = this.fb.group({
    email: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', { validators: [Validators.required, Validators.minLength(6)] }),
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      queueMicrotask(() => {
        requestAnimationFrame(() => this.animReady.set(true));
      });
    }
  }

  async submit() {
    this.serverError.set(null);
    this.successMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const v = this.form.getRawValue();

    try {
      await this.auth.login({ email: v.email, password: v.password }).toPromise();
      this.successMessage.set('Inicio de sesión exitoso, redirigiendo…');
      setTimeout(() => this.router.navigateByUrl('/profile'), 1000);
    } catch (e: any) {
      const msg = e?.error?.message || e?.message || 'Error al iniciar sesión.';
      this.serverError.set(/invalid|credenciales/i.test(msg) ? 'Credenciales inválidas.' : msg);
    } finally {
      this.submitting.set(false);
    }
  }

  async forgotPassword() {
    this.serverError.set(null);
    this.successMessage.set(null);

    const emailCtrl = this.form.controls.email;
    emailCtrl.markAsTouched();
    if (emailCtrl.invalid) {
      this.serverError.set('Ingresa un correo válido para recuperar tu contraseña.');
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this.serverError.set('La recuperación de contraseña solo está disponible en el navegador.');
      return;
    }

    this.submitting.set(true);
    const email = emailCtrl.value;

    try {
      const { error } = await this.supabase.client.auth.resetPasswordForEmail(email);
      if (error) throw error;
      this.successMessage.set('Si el correo existe, te enviamos un enlace para restablecer la contraseña.');
    } catch (e: any) {
      this.serverError.set(e?.message ?? 'No se pudo enviar el correo de recuperación.');
    } finally {
      this.submitting.set(false);
    }
  }
}
