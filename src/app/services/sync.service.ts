import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SqliteService } from './sqlite.service';
import { LaravelApiService } from './laravel-api.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { Task } from '../models/task.model';

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  public isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();

  private lastSyncSubject = new BehaviorSubject<Date | null>(null);
  public lastSync$: Observable<Date | null> = this.lastSyncSubject.asObservable();

  private syncErrorSubject = new BehaviorSubject<string | null>(null);
  public syncError$: Observable<string | null> = this.syncErrorSubject.asObservable();

  private hasPendingSyncSubject = new BehaviorSubject<boolean>(false);
  public hasPendingSync$: Observable<boolean> = this.hasPendingSyncSubject.asObservable();

  // Callback para avisar al TaskService cuando termine la sincronización
  public onSyncComplete?: () => Promise<void>;

  constructor(
    private sqliteService: SqliteService,
    private laravelApi: LaravelApiService,
    private networkService: NetworkService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {
    // Sincronizar automáticamente en cuanto el servidor Laravel vuelva a estar activo
    this.networkService.isOnline$.subscribe(async (online) => {
      if (online && this.authService.isAuthenticated) {
        await this.sync();
        if (this.onSyncComplete) {
          await this.onSyncComplete();
        }
      }
    });
  }

  get isSyncing(): boolean {
    return this.isSyncingSubject.value;
  }

  /**
   * Ejecuta el ciclo de sincronización bidireccional enfocado en el usuario autenticado
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, syncedCount: 0, message: 'Sincronización ya en curso' };
    }

    if (!this.networkService.isOnline) {
      this.syncErrorSubject.next('Servidor Laravel apagado. Las tareas se guardan en almacenamiento local.');
      return { success: false, syncedCount: 0, message: 'Servidor Laravel apagado' };
    }

    const currentUser = this.authService.currentUser;
    if (!currentUser) {
      return { success: false, syncedCount: 0, message: 'No hay usuario autenticado' };
    }

    this.isSyncingSubject.next(true);
    this.syncErrorSubject.next(null);

    let syncedItems = 0;

    try {
      // 1. Si el usuario fue registrado en modo offline, sincronizarlo primero con el backend
      if (currentUser.is_offline_only) {
        await this.authService.syncOfflineUserToServer(currentUser);
      }

      const activeUserId = this.authService.currentUser?.id;

      // 2. Obtener todas las operaciones pendientes locales del usuario actual
      const pendingTasks = await this.sqliteService.getPendingTasks(activeUserId);

      // 3. Enviar cambios pendientes a la API de Laravel
      for (const task of pendingTasks) {
        if (!this.networkService.isOnline) break; // Si el servidor se apaga en medio, detener

        try {
          if (task.sync_status === 'pending_create') {
            const created = await this.laravelApi.createTask(task, activeUserId);
            if (created && created.id) {
              await this.sqliteService.markAsSynced(task.id, created.id);
              syncedItems++;
            }
          } else if (task.sync_status === 'pending_update') {
            if (task.server_id) {
              await this.laravelApi.updateTask(task.server_id, task, activeUserId);
              await this.sqliteService.markAsSynced(task.id, task.server_id);
              syncedItems++;
            } else {
              const created = await this.laravelApi.createTask(task, activeUserId);
              if (created && created.id) {
                await this.sqliteService.markAsSynced(task.id, created.id);
                syncedItems++;
              }
            }
          } else if (task.sync_status === 'pending_delete') {
            if (task.server_id) {
              await this.laravelApi.deleteTask(task.server_id, activeUserId);
            }
            await this.sqliteService.deletePermanently(task.id);
            syncedItems++;
          }
        } catch (itemErr: any) {
          console.warn(`No se pudo sincronizar tarea (id: ${task.id}):`, itemErr);
          if (itemErr?.status === 0 || !itemErr?.status) {
            // El servidor cayó durante el bucle, salir
            break;
          }
        }
      }

      // 4. Descargar tareas actualizadas desde Laravel para el usuario actual y fusionar
      if (this.networkService.isOnline) {
        try {
          const serverTasks = await this.laravelApi.fetchTasks(activeUserId);
          if (serverTasks && Array.isArray(serverTasks)) {
            await this.sqliteService.mergeServerTasks(serverTasks, activeUserId);
          }
        } catch (fetchErr: any) {
          console.warn('Error al descargar tareas de Laravel:', fetchErr);
        }
      }

      // 5. Actualizar estado
      const remainingPending = await this.sqliteService.getPendingTasks(activeUserId);
      this.hasPendingSyncSubject.next(remainingPending.length > 0);
      this.lastSyncSubject.next(new Date());

      return {
        success: true,
        syncedCount: syncedItems,
        message: 'Sincronizado con éxito con Laravel API'
      };
    } catch (err: any) {
      console.warn('Error general durante la sincronización:', err);
      const errMsg = err?.message || 'Error de comunicación con Laravel API';
      this.syncErrorSubject.next(errMsg);
      return { success: false, syncedCount: syncedItems, message: errMsg };
    } finally {
      this.ngZone.run(() => {
        this.isSyncingSubject.next(false);
      });
    }
  }

  async checkPendingCount(): Promise<number> {
    const currentUserId = this.authService.currentUser?.id;
    const list = await this.sqliteService.getPendingTasks(currentUserId);
    this.hasPendingSyncSubject.next(list.length > 0);
    return list.length;
  }
}
