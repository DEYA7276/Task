import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const STORAGE_API_KEY = 'laravel_api_base_url';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  // Estado real de disponibilidad del servidor Laravel (NO dependiente de Internet)
  private isOnlineSubject = new BehaviorSubject<boolean>(false);
  public isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable().pipe(distinctUntilChanged());

  private checkIntervalId: any = null;
  private isChecking: boolean = false;

  constructor(private ngZone: NgZone) {
    this.startServerMonitoring();
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  private getPingUrl(): string {
    const saved = localStorage.getItem(STORAGE_API_KEY);
    const base = (saved && saved.trim()) ? saved.trim() : (environment.apiUrl || 'http://127.0.0.1:8000/api');
    return `${base.replace(/\/+$/, '')}/ping`;
  }

  /**
   * Inicia el monitoreo continuo de disponibilidad del servidor Laravel
   */
  private startServerMonitoring() {
    // Verificación inmediata al instanciar
    this.checkServerNow();

    // Monitoreo periódico cada 3 segundos
    this.ngZone.runOutsideAngular(() => {
      this.checkIntervalId = setInterval(() => {
        this.checkServerNow();
      }, 3000);
    });
  }

  /**
   * Consulta al endpoint /ping del servidor de Laravel con timeout ultrarrápido
   */
  async checkServerNow(): Promise<boolean> {
    if (this.isChecking) return this.isOnline;
    this.isChecking = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(this.getPingUrl(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const ok = response.ok;
      this.setServerState(ok);
      return ok;
    } catch {
      this.setServerState(false);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Permite a otros servicios (API, Sync, Auth) notificar inmediatamente que el servidor cayó
   */
  reportServerDown(): void {
    this.setServerState(false);
  }

  /**
   * Permite notificar que una llamada al servidor respondió exitosamente
   */
  reportServerUp(): void {
    this.setServerState(true);
  }

  private setServerState(online: boolean) {
    if (this.isOnlineSubject.value !== online) {
      this.ngZone.run(() => {
        this.isOnlineSubject.next(online);
      });
    }
  }
}
