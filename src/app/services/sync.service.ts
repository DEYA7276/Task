import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SqliteService } from './sqlite.service';
import { LaravelApiService } from './laravel-api.service';
import { NetworkService } from './network.service';
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

  constructor(
    private sqliteService: SqliteService,
    private laravelApi: LaravelApiService,
    private networkService: NetworkService,
    private ngZone: NgZone
  ) {
    // Sincronizar automáticamente en cuanto se restablezca la conexión
    this.networkService.isOnline$.subscribe((online) => {
      if (online) {
        this.sync();
      }
    });
  }

  get isSyncing(): boolean {
    return this.isSyncingSubject.value;
  }

  /**
   * Ejecuta el ciclo completo de sincronización bidireccional
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, syncedCount: 0, message: 'Sincronización ya en curso' };
    }

    if (!this.networkService.isOnline) {
      this.syncErrorSubject.next('Sin conexión a internet. Los datos se guardan en SQLite local.');
      return { success: false, syncedCount: 0, message: 'Sin conexión a internet' };
    }

    this.isSyncingSubject.next(true);
    this.syncErrorSubject.next(null);

    let syncedItems = 0;

    try {
      // 1. Obtener todas las operaciones pendientes locales en SQLite
      const pendingTasks = await this.sqliteService.getPendingTasks();

      // 2. Enviar cambios pendientes a la API de Laravel
      for (const task of pendingTasks) {
        try {
          if (task.sync_status === 'pending_create') {
            const created = await this.laravelApi.createTask(task);
            if (created && created.id) {
              await this.sqliteService.markAsSynced(task.id, created.id);
              syncedItems++;
            }
          } else if (task.sync_status === 'pending_update') {
            if (task.server_id) {
              await this.laravelApi.updateTask(task.server_id, task);
              await this.sqliteService.markAsSynced(task.id, task.server_id);
              syncedItems++;
            } else {
              // Si aún no tenía server_id, crearlo en Laravel
              const created = await this.laravelApi.createTask(task);
              if (created && created.id) {
                await this.sqliteService.markAsSynced(task.id, created.id);
                syncedItems++;
              }
            }
          } else if (task.sync_status === 'pending_delete') {
            if (task.server_id) {
              await this.laravelApi.deleteTask(task.server_id);
            }
            await this.sqliteService.deletePermanently(task.id);
            syncedItems++;
          }
        } catch (itemErr: any) {
          console.warn(`No se pudo sincronizar tarea individual (id: ${task.id}):`, itemErr);
          // Continúa con las demás tareas
        }
      }

      // 3. Descargar tareas actualizadas desde Laravel y fusionar con SQLite local
      try {
        const serverTasks = await this.laravelApi.fetchTasks();
        if (serverTasks && Array.isArray(serverTasks)) {
          await this.sqliteService.mergeServerTasks(serverTasks);
        }
      } catch (fetchErr: any) {
        console.warn('No se pudo descargar listado de Laravel (¿servidor no iniciado o error de red?):', fetchErr);
      }

      // 4. Actualizar estado
      const remainingPending = await this.sqliteService.getPendingTasks();
      this.hasPendingSyncSubject.next(remainingPending.length > 0);
      this.lastSyncSubject.next(new Date());

      return {
        success: true,
        syncedCount: syncedItems,
        message: 'Sincronizado con éxito con Laravel API'
      };
    } catch (err: any) {
      console.error('Error general durante la sincronización:', err);
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
    const list = await this.sqliteService.getPendingTasks();
    this.hasPendingSyncSubject.next(list.length > 0);
    return list.length;
  }
}
