import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardContent,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  personOutline,
  eyeOutline,
  eyeOffOutline,
  arrowForwardOutline,
  warningOutline,
  serverOutline,
  sparklesOutline
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonCard,
    IonCardContent,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    IonSegment,
    IonSegmentButton
  ]
})
export class LoginPage implements OnInit {
  authMode: 'login' | 'register' = 'login';

  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  displayName: string = '';

  showPassword: boolean = false;
  isLoading: boolean = false;
  errorMessage: string | null = null;

  private authService = inject(AuthService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      personOutline,
      eyeOutline,
      eyeOffOutline,
      arrowForwardOutline,
      warningOutline,
      serverOutline,
      sparklesOutline
    });
  }

  ngOnInit() {
    this.errorMessage = null;
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  onSegmentChange(event: any) {
    this.authMode = event.detail.value;
    this.errorMessage = null;
  }

  async onSubmit() {
    this.errorMessage = null;

    if (!this.email || !this.email.trim()) {
      this.errorMessage = 'Ingresa tu correo electrónico.';
      return;
    }

    if (!this.password || this.password.length < 6) {
      this.errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    if (this.authMode === 'register' && this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      return;
    }

    this.isLoading = true;

    try {
      if (this.authMode === 'register') {
        await this.authService.register(
          this.email.trim(),
          this.password,
          this.displayName ? this.displayName.trim() : undefined
        );
        await this.showToast('¡Cuenta creada y sincronizada exitosamente!', 'success');
      } else {
        await this.authService.login(this.email.trim(), this.password);
        await this.showToast('Sesión iniciada correctamente', 'success');
      }

      this.router.navigate(['/tasks'], { replaceUrl: true });
    } catch (err: any) {
      this.errorMessage = err.message || 'Error al autenticar';
      await this.showToast(this.errorMessage || 'Error', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      position: 'top',
      color,
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
}
