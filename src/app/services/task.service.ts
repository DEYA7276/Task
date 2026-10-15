import { Injectable, NgZone } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { SqliteService } from './sqlite.service';
import { SyncService, SyncResult } from './sync.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { Task, TaskCategory, TaskPriority } from '../models/task.model';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  public tasks$: Observable<Task[]> = this.tasksSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  private pendingCountSubject = new BehaviorSubject<number>(0);
  public pendingCount$: Observable<number> = this.pendingCountSubject.asObservable();

  public isOnline$: Observable<boolean>;
  public isSyncing$: Observable<boolean>;

  constructor(
    private sqliteService: SqliteService,
    private syncService: SyncService,
    private networkService: NetworkService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {
    this.isOnline$ = this.networkService.isOnline$;
    this.isSyncing$ = this.syncService.isSyncing$;

    // Conectar el callback de sincronización completada para actualizar la interfaz
    this.syncService.onSyncComplete = async () => {
      await this.refreshTasks();
    };

    // Escuchar cambios de usuario activo para mostrar ÚNICAMENTE sus tareas
    this.authService.currentUser$.subscribe(async (user) => {
      if (user && user.id) {
        await this.sqliteService.claimUnassignedTasks(user.id);
        await this.refreshTasks();
        if (this.networkService.isOnline) {
          this.syncNow();
        }
      } else {
        this.tasksSubject.next([]);
        this.pendingCountSubject.next(0);
      }
    });

    this.initialize();
  }

  private async initialize() {
    this.loadingSubject.next(true);
    await this.sqliteService.init();

    const currentUser = this.authService.currentUser;
    if (currentUser && currentUser.id) {
      await this.sqliteService.claimUnassignedTasks(currentUser.id);
      await this.refreshTasks();
      if (this.networkService.isOnline) {
        this.syncNow();
      }
    } else {
      this.tasksSubject.next([]);
      this.pendingCountSubject.next(0);
    }

    this.loadingSubject.next(false);
  }

  /**
   * Refresca las tareas desde SQLite/IndexedDB filtrando por el usuario autenticado
   */
  async refreshTasks(): Promise<void> {
    try {
      const activeUserId = this.authService.currentUser?.id;
      if (!activeUserId) {
        this.ngZone.run(() => {
          this.tasksSubject.next([]);
          this.pendingCountSubject.next(0);
        });
        return;
      }

      const tasks = await this.sqliteService.getTasks(activeUserId);
      const pendingList = await this.sqliteService.getPendingTasks(activeUserId);

      this.ngZone.run(() => {
        this.tasksSubject.next(tasks);
        this.pendingCountSubject.next(pendingList.length);
      });
    } catch (err) {
      console.error('Error cargando tareas desde SQLite local:', err);
    }
  }

  /**
   * Agrega una nueva tarea: Guarda en SQLite primero y luego sincroniza si el servidor Laravel está activo.
   * Si el servidor Laravel está apagado, se guarda localmente sin errores ni bloqueos.
   */
  async addTask(taskData: {
    title: string;
    description?: string;
    imageUrl?: string;
    priority?: TaskPriority;
    category?: TaskCategory;
    dueDate?: string;
  }): Promise<Task> {
    const activeUserId = this.authService.currentUser?.id ?? null;
    const id = 'tsk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();

    const newTask: Task = {
      id,
      user_id: activeUserId,
      server_id: null,
      title: taskData.title.trim(),
      description: taskData.description ? taskData.description.trim() : '',
      imageUrl: taskData.imageUrl || '',
      completed: false,
      priority: taskData.priority || 'media',
      category: taskData.category || 'personal',
      createdAt: now,
      updatedAt: now,
      dueDate: taskData.dueDate || '',
      sync_status: 'pending_create'
    };

    // 1. Guardar en SQLite local inmediatamente (Offline-first garantizado)
    await this.sqliteService.insertTask(newTask);
    await this.refreshTasks();

    // 2. Si el servidor Laravel está encendido, sincronizar en segundo plano sin bloquear
    if (this.networkService.isOnline) {
      this.syncNow().catch((e) => console.warn('Sync en segundo plano pospuesto:', e));
    }

    return newTask;
  }

  /**
   * Modifica una tarea existente: Actualiza en SQLite y sincroniza si el servidor está encendido
   */
  async updateTask(taskId: string, changes: Partial<Task>): Promise<void> {
    const current = this.tasksSubject.value.find((t) => t.id === taskId);
    if (!current) return;

    const updatedTask: Task = {
      ...current,
      ...changes,
      title: changes.title !== undefined ? changes.title.trim() : current.title,
      description: changes.description !== undefined ? changes.description?.trim() : current.description,
      updatedAt: Date.now(),
      sync_status: current.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    };

    // 1. Actualizar en SQLite local inmediatamente
    await this.sqliteService.updateTask(updatedTask);
    await this.refreshTasks();

    // 2. Sincronizar en segundo plano si el servidor responde
    if (this.networkService.isOnline) {
      this.syncNow().catch((e) => console.warn('Sync en segundo plano pospuesto:', e));
    }
  }

  /**
   * Alterna el estado completado de una tarea
   */
  async toggleTaskComplete(task: Task): Promise<void> {
    await this.updateTask(task.id, {
      completed: !task.completed
    });
  }

  /**
   * Elimina una tarea: Marca o borra en SQLite y sincroniza si el servidor está encendido
   */
  async deleteTask(taskId: string): Promise<void> {
    // 1. Marcar o borrar en SQLite local inmediatamente
    await this.sqliteService.deleteTask(taskId);
    await this.refreshTasks();

    // 2. Sincronizar eliminación con Laravel si el servidor está activo
    if (this.networkService.isOnline) {
      this.syncNow().catch((e) => console.warn('Sync en segundo plano pospuesto:', e));
    }
  }

  /**
   * Ejecuta sincronización manual o programada y actualiza la vista
   */
  async syncNow(): Promise<SyncResult> {
    const result = await this.syncService.sync();
    await this.refreshTasks();
    return result;
  }
}
