import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { LaravelApiService } from './laravel-api.service';
import { NetworkService } from './network.service';
import { UserProfile } from '../models/task.model';

const STORAGE_USER_KEY = 'taskdey_active_user';
const STORAGE_CREDENTIALS_CACHE = 'taskdey_offline_users';

export interface CachedCredential {
  profile: UserProfile;
  pass: string;
  pending_server_sync?: boolean;
}

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
   * Inicio de sesión: Si el servidor Laravel responde se valida con él;
   * si el servidor está apagado o falla la conexión, usa la caché local offline.
   */
  async login(email: string, pass: string): Promise<UserProfile> {
    const cleanEmail = email.trim().toLowerCase();

    // Intentar primero con el servidor Laravel si está reportado encendido
    if (this.networkService.isOnline) {
      try {
        const url = `${this.laravelApi.getApiUrl()}/login`;
        const res: any = await firstValueFrom(
          this.http.post(url, { email: cleanEmail, password: pass }, { headers: this.getHeaders() })
            .pipe(timeout(3500))
        );

        this.networkService.reportServerUp();

        const userData = res?.user || res?.data || res;
        const profile: UserProfile = {
          id: userData.id || Date.now(),
          name: userData.name || cleanEmail.split('@')[0],
          email: userData.email || cleanEmail
        };

        this.saveUserSession(profile);
        this.cacheUserOffline(profile, pass, false);
        return profile;
      } catch (err: any) {
        if (err?.status === 401) {
          throw new Error('Correo electrónico o contraseña incorrectos.');
        }
        if (err?.status === 422 && err?.error?.mensaje) {
          throw new Error(err.error.mensaje);
        }
        // Si el error es status 0 o timeout, significa que el servidor Laravel se apagó
        if (err?.status === 0 || !err?.status) {
          this.networkService.reportServerDown();
        }
        // Fallback inmediato a modo sin conexión local
        return this.tryOfflineLogin(cleanEmail, pass);
      }
    } else {
      // Modo servidor apagado: validar contra caché local
      return this.tryOfflineLogin(cleanEmail, pass);
    }
  }

  /**
   * Registro de nuevo usuario: Se guarda en Laravel si está activo,
   * o se registra en almacenamiento local si el servidor Laravel está apagado.
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
            .pipe(timeout(4000))
        );

        this.networkService.reportServerUp();

        const userData = res?.user || res?.data || res;
        const profile: UserProfile = {
          id: userData.id || Date.now(),
          name: userData.name || cleanName,
          email: userData.email || cleanEmail
        };

        this.saveUserSession(profile);
        this.cacheUserOffline(profile, pass, false);
        return profile;
      } catch (err: any) {
        // Validación de Laravel (por ejemplo correo ya registrado con otra clave)
        if (err?.status === 422) {
          const errors = err?.error?.errors;
          if (errors?.email) {
            throw new Error(errors.email[0]);
          }
          throw new Error(err?.error?.message || err?.error?.mensaje || 'Los datos proporcionados no son válidos.');
        }

        // Si falló por falta de conexión al servidor Laravel
        if (err?.status === 0 || !err?.status) {
          this.networkService.reportServerDown();
          // Registrar localmente para no bloquear al usuario
          return this.registerOffline(cleanEmail, cleanName, pass);
        }

        throw new Error(err?.message || 'Error al conectar con el servidor de Laravel.');
      }
    } else {
      // Servidor apagado: crear cuenta en local directamente
      return this.registerOffline(cleanEmail, cleanName, pass);
    }
  }

  private registerOffline(email: string, name: string, pass: string): UserProfile {
    const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
    const list: CachedCredential[] = raw ? JSON.parse(raw) : [];
    const existing = list.find((u) => u.profile.email === email);

    if (existing) {
      if (existing.pass === pass) {
        this.saveUserSession(existing.profile);
        return existing.profile;
      }
      throw new Error('Este correo ya está registrado en local con otra contraseña.');
    }

    const profile: UserProfile = {
      id: 'usr_' + Date.now(),
      name,
      email,
      is_offline_only: true
    };

    this.saveUserSession(profile);
    this.cacheUserOffline(profile, pass, true);
    return profile;
  }

  /**
   * Intenta sincronizar un usuario registrado en local cuando el servidor Laravel se reenciende
   */
  async syncOfflineUserToServer(profile: UserProfile): Promise<UserProfile | null> {
    if (!profile.is_offline_only) return profile;

    const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
    if (!raw) return null;

    const list: CachedCredential[] = JSON.parse(raw);
    const item = list.find((u) => u.profile.email === profile.email);
    if (!item) return null;

    try {
      const url = `${this.laravelApi.getApiUrl()}/register`;
      const res: any = await firstValueFrom(
        this.http.post(url, {
          name: profile.name,
          email: profile.email,
          password: item.pass
        }, { headers: this.getHeaders() }).pipe(timeout(4000))
      );

      const userData = res?.user || res?.data || res;
      if (userData?.id) {
        const updatedProfile: UserProfile = {
          id: userData.id,
          name: userData.name || profile.name,
          email: userData.email || profile.email,
          is_offline_only: false
        };

        this.saveUserSession(updatedProfile);
        this.cacheUserOffline(updatedProfile, item.pass, false);
        return updatedProfile;
      }
    } catch {
      // Ignorar fallo puntual de sincronización de usuario
    }
    return null;
  }

  /**
   * Cierre de sesión
   */
  async logout(): Promise<void> {
    if (this.networkService.isOnline) {
      try {
        const url = `${this.laravelApi.getApiUrl()}/logout`;
        await firstValueFrom(
          this.http.post(url, {}, { headers: this.getHeaders() }).pipe(timeout(2000))
        );
      } catch {
        // Ignorar error al cerrar sesión
      }
    }

    localStorage.removeItem(STORAGE_USER_KEY);
    this.currentUserSubject.next(null);
  }

  public saveUserSession(profile: UserProfile) {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(profile));
    this.currentUserSubject.next(profile);
  }

  private cacheUserOffline(profile: UserProfile, pass: string, pendingSync: boolean = false) {
    try {
      const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
      const list: CachedCredential[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((u) => u.profile.email === profile.email);
      const item: CachedCredential = { profile, pass, pending_server_sync: pendingSync };

      if (idx >= 0) {
        list[idx] = item;
      } else {
        list.push(item);
      }
      localStorage.setItem(STORAGE_CREDENTIALS_CACHE, JSON.stringify(list));
    } catch {}
  }

  private tryOfflineLogin(email: string, pass: string): UserProfile {
    try {
      const raw = localStorage.getItem(STORAGE_CREDENTIALS_CACHE);
      if (raw) {
        const list: CachedCredential[] = JSON.parse(raw);
        const match = list.find((u) => u.profile.email === email && u.pass === pass);
        if (match) {
          this.saveUserSession(match.profile);
          return match.profile;
        }
      }
    } catch {}
    throw new Error('Servidor Laravel apagado: No se encontró una sesión previa guardada en este dispositivo para estas credenciales.');
  }
}
