import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { LaravelApiService } from './laravel-api.service';
import { NetworkService } from './network.service';
import { UserProfile } from '../models/task.model';

const STORAGE_USER_KEY = 'taskdey_active_user';
const STORAGE_CREDENTIALS_CACHE = 'taskdey_offline_users';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<UserProfile | null>(null);
  public currentUser$: Observable<UserProfile | null> = this.currentUserSubject.asObservable();

  private authInitializedSubject = new BehaviorSubject<boolean>(false);
  public authInitialized$: Observable<boolean> = this.authInitializedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private laravelApi: LaravelApiService,
    private networkService: NetworkService
  ) {
    this.restoreSession();
  }

  get currentUser(): UserProfile | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  private restoreSession() {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      if (saved) {
        const user = JSON.parse(saved);
        if (user && user.email) {
          this.currentUserSubject.next(user);
        }
      }
    } catch (e) {
      console.warn('Error restaurando sesión local:', e);
    } finally {
      this.authInitializedSubject.next(true);
    }
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  /**
   * Inicio de sesión con Laravel API (y soporte para modo sin conexión)
   */
  async login(email: string, pass: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Si hay conexión a internet, validar con Laravel API
    if (this.networkService.isOnline) {
      try {
        const url = `${this.laravelApi.getApiUrl()}/login`;
        const res: any = await firstValueFrom(
          this.http.post(url, { email: cleanEmail, password: pass }, { headers: this.getHeaders() })
            .pipe(timeout(6000))
        );

        const userData = res?.user || res?.data || res;
        const profile: UserProfile = {
          id: userData.id || Date.now(),
          name: userData.name || cleanEmail.split('@')[0],
          email: userData.email || cleanEmail
        };

        this.saveUserSession(profile);
        this.cacheUserOffline(profile, pass);
        return profile;
      } catch (err: any) {
        if (err?.status === 401) {
          throw new Error('Correo electrónico o contraseña incorrectos.');
        }
        if (err?.error?.mensaje) {
          throw new Error(err.error.mensaje);
        }
        if (err?.error?.message) {
          throw new Error(err.error.message);
        }
        // Si falló por timeout o servidor inactivo, intentar fallback offline
        return this.tryOfflineLogin(cleanEmail, pass);
      }
    } else {
      // 2. Si está offline, usar autenticación contra caché local
      return this.tryOfflineLogin(cleanEmail, pass);
    }
  }

  /**
   * Registro de nuevo usuario en Laravel API (o en caché local si offline)
   */
  async register(email: string, pass: string, name?: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name && name.trim()) ? name.trim() : cleanEmail.split('@')[0];

    if (this.networkService.isOnline) {
      try {
        const url = `${this.laravelApi.getApiUrl()}/register`;
        const payload = {
          name: cleanName,
          email: cleanEmail,
          password: pass
        };

        const res: any = await firstValueFrom(
          this.http.post(url, payload, { headers: this.getHeaders() })
            .pipe(timeout(8000))
        );

        const userData = res?.user || res?.data || res;
        const profile: UserProfile = {
          id: userData.id || Date.now(),
          name: userData.name || cleanName,
          email: userData.email || cleanEmail
        };

        this.saveUserSession(profile);
        this.cacheUserOffline(profile, pass);
        return profile;
      } catch (err: any) {
        if (err?.status === 422) {
          const errors = err?.error?.errors;
          if (errors?.email) {
            throw new Error(errors.email[0]);
          }
          throw new Error(err?.error?.message || 'Los datos proporcionados no son válidos.');
        }
        if (err?.error?.mensaje) {
          throw new Error(err.error.mensaje);
        }
        throw new Error(err?.message || 'Error al conectar con el servidor de Laravel.');
      }
    } else {
      // Registro local offline
      const profile: UserProfile = {
        id: Date.now(),
        name: cleanName,
        email: cleanEmail
      };
      this.saveUserSession(profile);
      this.cacheUserOffline(profile, pass);
      return profile;
    }
  }

  /**
   * Cierre de sesión
   */
  async logout(): Promise<void> {
    if (this.networkService.isOnline) {
      try {
        const url = `${this.laravelApi.getApiUrl()}/logout`;
        await firstValueFrom(
          this.http.post(url, {}, { headers: this.getHeaders() }).pipe(timeout(3000))
        );
      } catch {
        // Ignorar error al cerrar sesión
      }
    }

    localStorage.removeItem(STORAGE_USER_KEY);
    this.currentUserSubject.next(null);
  }

  private saveUserSession(profile: UserProfile) {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(profile));
    this.currentUserSubject.next(profile);
  }

  private cacheUserOffline(profile: UserProfile, pass: string) {
    try {
      const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((u) => u.email === profile.email);
      if (idx >= 0) {
        list[idx] = { profile, pass };
      } else {
        list.push({ profile, pass });
      }
      localStorage.setItem(STORAGE_CREDENTIALS_CACHE, JSON.stringify(list));
    } catch {}
  }

  private tryOfflineLogin(email: string, pass: string): UserProfile {
    try {
      const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
      if (raw) {
        const list: any[] = JSON.parse(raw);
        const match = list.find((u) => u.email === email && u.pass === pass);
        if (match) {
          this.saveUserSession(match.profile);
          return match.profile;
        }
      }
    } catch {}
    throw new Error('Modo sin conexión: No se encontró una sesión previa guardada para estas credenciales.');
  }
}
