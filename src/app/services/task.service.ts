import { Injectable, NgZone } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { SqliteService } from './sqlite.service';
import { SyncService, SyncResult } from './sync.service';
import { NetworkService } from './network.service';
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
    private ngZone: NgZone
  ) {
    this.isOnline$ = this.networkService.isOnline$;
    this.isSyncing$ = this.syncService.isSyncing$;

    this.initialize();
  }

  private async initialize() {
    this.loadingSubject.next(true);
    await this.sqliteService.init();
    await this.refreshTasks();
    this.loadingSubject.next(false);

    // Si hay conexión al iniciar, intentar sincronizar con Laravel
    if (this.networkService.isOnline) {
      this.syncNow();
    }
  }

  /**
   * Refresca las tareas desde SQLite y actualiza el Subject
   */
  async refreshTasks(): Promise<void> {
    try {
      const tasks = await this.sqliteService.getTasks();
      const pendingList = await this.sqliteService.getPendingTasks();

      this.ngZone.run(() => {
        this.tasksSubject.next(tasks);
        this.pendingCountSubject.next(pendingList.length);
      });
    } catch (err) {
      console.error('Error cargando tareas desde SQLite:', err);
    }
  }

  /**
   * Agrega una nueva tarea: Guarda en SQLite primero y luego sincroniza si hay red
   */
  async addTask(taskData: {
    title: string;
    description?: string;
    imageUrl?: string;
    priority?: TaskPriority;
    category?: TaskCategory;
    dueDate?: string;
  }): Promise<Task> {
    const id = 'tsk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();

    const newTask: Task = {
      id,
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

    // 1. Guardar en SQLite local inmediatamente (Offline-first)
    await this.sqliteService.insertTask(newTask);
    await this.refreshTasks();

    // 2. Si hay conexión a internet, sincronizar con Laravel en segundo plano
    if (this.networkService.isOnline) {
      this.syncNow();
    }

    return newTask;
  }

  /**
   * Modifica una tarea existente: Actualiza en SQLite y sincroniza si hay conexión
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
      // Si ya era pending_create, se mantiene pending_create; si estaba synced, pasa a pending_update
      sync_status: current.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    };

    // 1. Actualizar en SQLite local inmediatamente
    await this.sqliteService.updateTask(updatedTask);
    await this.refreshTasks();

    // 2. Sincronizar en segundo plano si hay red
    if (this.networkService.isOnline) {
      this.syncNow();
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
   * Elimina una tarea: Marca o borra en SQLite y sincroniza si hay conexión
   */
  async deleteTask(taskId: string): Promise<void> {
    // 1. Marcar o borrar en SQLite local inmediatamente
    await this.sqliteService.deleteTask(taskId);
    await this.refreshTasks();

    // 2. Sincronizar eliminación con Laravel en segundo plano
    if (this.networkService.isOnline) {
      this.syncNow();
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
