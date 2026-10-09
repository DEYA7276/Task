import { Injectable, NgZone } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  public isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.initNetworkMonitoring();
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  private async initNetworkMonitoring() {
    try {
      // Estado inicial con Capacitor Network
      const status = await Network.getStatus();
      this.isOnlineSubject.next(status.connected);

      // Listener de Capacitor
      Network.addListener('networkStatusChange', (s) => {
        this.ngZone.run(() => {
          this.isOnlineSubject.next(s.connected);
        });
      });
    } catch {
      // Fallback a window online/offline
      this.isOnlineSubject.next(navigator.onLine);
    }

    // Doble verificación con eventos estándar de ventana
    window.addEventListener('online', () => {
      this.ngZone.run(() => this.isOnlineSubject.next(true));
    });
    window.addEventListener('offline', () => {
      this.ngZone.run(() => this.isOnlineSubject.next(false));
    });
  }
}
