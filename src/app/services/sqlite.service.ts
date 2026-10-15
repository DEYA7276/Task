import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';
import { Task, SyncStatus } from '../models/task.model';

const DB_NAME = 'taskdey_local_db';
const DB_VERSION = 1;

@Injectable({
  providedIn: 'root'
})
export class SqliteService {
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isNative: boolean = false;
  private isInitialized: boolean = false;

  // Fallback para navegador web (IndexedDB) en caso de pruebas locales con 'ng serve'
  private idbName = 'taskdey_indexeddb';
  private idbStore = 'tasks';

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  /**
   * Inicializa la base de datos SQLite (o fallback IndexedDB en navegador)
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (this.isNative) {
        // En Android / iOS nativo usando Capacitor SQLite
        this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
        const isDbOpen = await this.sqliteConnection.isConnection(DB_NAME, false);
        if (isDbOpen.result) {
          this.db = await this.sqliteConnection.retrieveConnection(DB_NAME, false);
        } else {
          this.db = await this.sqliteConnection.createConnection(
            DB_NAME,
            false,
            'no-encryption',
            DB_VERSION,
            false
          );
        }

        await this.db.open();
        await this.createTablesNative();
      } else {
        // En navegador web (pruebas locales): Intentar jeep-sqlite o fallback IndexedDB
        await this.initWebFallback();
      }
      this.isInitialized = true;
      console.log('SQLite inicializado correctamente en plataforma:', this.isNative ? 'Nativa' : 'Web');
    } catch (err) {
      console.warn('Error inicializando SQLite nativo, activando modo almacenamiento local resiliente:', err);
      await this.initWebFallback();
      this.isInitialized = true;
    }
  }

  private async createTablesNative(): Promise<void> {
    if (!this.db) return;
    const query = `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        server_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        imageUrl TEXT,
        completed INTEGER DEFAULT 0,
        priority TEXT DEFAULT 'media',
        category TEXT DEFAULT 'personal',
        dueDate TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        sync_status TEXT DEFAULT 'pending_create'
      );
    `;
    await this.db.execute(query);

    // Migración defensiva en caso de que la tabla ya existiera previamente sin user_id
    try {
      await this.db.execute(`ALTER TABLE tasks ADD COLUMN user_id TEXT;`);
    } catch {
      // La columna ya existe, ignorar
    }
  }

  // ==========================================
  // OPERACIONES CRUD DE TAREAS EN SQLITE LOCAL
  // ==========================================

  /**
   * Obtiene todas las tareas visibles para el usuario actual (excluye las pendientes de eliminar)
   */
  async getTasks(userId?: number | string | null): Promise<Task[]> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      let query = `SELECT * FROM tasks WHERE sync_status != 'pending_delete'`;
      const params: any[] = [];
      if (userId != null) {
        query += ` AND (user_id = ? OR user_id IS NULL)`;
        params.push(String(userId));
      }
      query += ` ORDER BY createdAt DESC;`;
      const res = await this.db.query(query, params);
      return (res.values || []).map((row: any) => this.rowToTask(row));
    } else {
      const all = await this.idbGetAll();
      return all
        .filter((t) => t.sync_status !== 'pending_delete')
        .filter((t) => userId == null || t.user_id == null || String(t.user_id) === String(userId))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  /**
   * Obtiene las tareas pendientes de sincronizar con Laravel para el usuario actual
   */
  async getPendingTasks(userId?: number | string | null): Promise<Task[]> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      let query = `SELECT * FROM tasks WHERE sync_status IN ('pending_create', 'pending_update', 'pending_delete')`;
      const params: any[] = [];
      if (userId != null) {
        query += ` AND (user_id = ? OR user_id IS NULL)`;
        params.push(String(userId));
      }
      const res = await this.db.query(query, params);
      return (res.values || []).map((row: any) => this.rowToTask(row));
    } else {
      const all = await this.idbGetAll();
      return all
        .filter((t) => t.sync_status !== 'synced')
        .filter((t) => userId == null || t.user_id == null || String(t.user_id) === String(userId));
    }
  }

  /**
   * Inserta una nueva tarea en SQLite local
   */
  async insertTask(task: Task): Promise<void> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      const query = `
        INSERT OR REPLACE INTO tasks (
          id, user_id, server_id, title, description, imageUrl,
          completed, priority, category, dueDate,
          createdAt, updatedAt, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const values = [
        task.id,
        task.user_id != null ? String(task.user_id) : null,
        task.server_id ?? null,
        task.title,
        task.description ?? '',
        task.imageUrl ?? '',
        task.completed ? 1 : 0,
        task.priority,
        task.category,
        task.dueDate ?? '',
        task.createdAt,
        task.updatedAt ?? Date.now(),
        task.sync_status
      ];
      await this.db.run(query, values);
    } else {
      await this.idbPut(task);
    }
  }

  /**
   * Actualiza una tarea en SQLite local
   */
  async updateTask(task: Task): Promise<void> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      const query = `
        UPDATE tasks SET
          user_id = ?,
          server_id = ?,
          title = ?,
          description = ?,
          imageUrl = ?,
          completed = ?,
          priority = ?,
          category = ?,
          dueDate = ?,
          updatedAt = ?,
          sync_status = ?
        WHERE id = ?;
      `;
      const values = [
        task.user_id != null ? String(task.user_id) : null,
        task.server_id ?? null,
        task.title,
        task.description ?? '',
        task.imageUrl ?? '',
        task.completed ? 1 : 0,
        task.priority,
        task.category,
        task.dueDate ?? '',
        Date.now(),
        task.sync_status,
        task.id
      ];
      await this.db.run(query, values);
    } else {
      await this.idbPut(task);
    }
  }

  /**
   * Marca una tarea para eliminar o la borra permanentemente si nunca se sincronizó
   */
  async deleteTask(id: string): Promise<void> {
    await this.ensureReady();

    let task: Task | null = null;
    if (this.isNative && this.db) {
      const res = await this.db.query(`SELECT * FROM tasks WHERE id = ?;`, [id]);
      if (res.values && res.values.length > 0) {
        task = this.rowToTask(res.values[0]);
      }
    } else {
      task = await this.idbGet(id);
    }

    if (!task) return;

    // Si nunca se envió al servidor (sin server_id), se elimina directo de SQLite
    if (!task.server_id) {
      await this.deletePermanently(id);
    } else {
      // Si ya existe en Laravel, marcar como pendiente de borrar para el sync
      task.sync_status = 'pending_delete';
      task.updatedAt = Date.now();
      if (this.isNative && this.db) {
        await this.db.run(
          `UPDATE tasks SET sync_status = 'pending_delete', updatedAt = ? WHERE id = ?;`,
          [task.updatedAt, id]
        );
      } else {
        await this.idbPut(task);
      }
    }
  }

  /**
   * Elimina definitivamente una tarea de SQLite
   */
  async deletePermanently(id: string): Promise<void> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      await this.db.run(`DELETE FROM tasks WHERE id = ?;`, [id]);
    } else {
      await this.idbDelete(id);
    }
  }

  /**
   * Marca una tarea como sincronizada con su ID del backend de Laravel
   */
  async markAsSynced(localId: string, serverId: number): Promise<void> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      await this.db.run(
        `UPDATE tasks SET server_id = ?, sync_status = 'synced', updatedAt = ? WHERE id = ?;`,
        [serverId, 'synced', Date.now(), localId]
      );
    } else {
      const task = await this.idbGet(localId);
      if (task) {
        task.server_id = serverId;
        task.sync_status = 'synced';
        task.updatedAt = Date.now();
        await this.idbPut(task);
      }
    }
  }

  /**
   * Asigna tareas huérfanas (sin user_id) al usuario actual
   */
  async claimUnassignedTasks(userId: number | string): Promise<void> {
    await this.ensureReady();

    if (this.isNative && this.db) {
      await this.db.run(
        `UPDATE tasks SET user_id = ? WHERE user_id IS NULL OR user_id = '';`,
        [String(userId)]
      );
    } else {
      const all = await this.idbGetAll();
      for (const t of all) {
        if (t.user_id == null || t.user_id === '') {
          t.user_id = userId;
          await this.idbPut(t);
        }
      }
    }
  }

  /**
   * Fusión de tareas provenientes de Laravel con SQLite local para el usuario actual
   */
  async mergeServerTasks(serverTasks: any[], userId?: number | string | null): Promise<void> {
    await this.ensureReady();

    const localTasks = await this.getTasks(userId);
    const localByServerId = new Map<number, Task>();
    const localById = new Map<string, Task>();

    for (const lt of localTasks) {
      if (lt.server_id) {
        localByServerId.set(lt.server_id, lt);
      }
      localById.set(lt.id, lt);
    }

    for (const st of serverTasks) {
      const serverId = Number(st.id);
      const existing = localByServerId.get(serverId);

      if (existing) {
        // Solo sobrescribir si la tarea local está sincronizada sin cambios pendientes
        if (existing.sync_status === 'synced') {
          if (userId != null) {
            existing.user_id = userId;
          }
          existing.title = st.title || existing.title;
          existing.description = st.description ?? '';
          existing.imageUrl = st.imageUrl || st.image_url || '';
          existing.completed = !!st.completed;
          existing.priority = st.priority || 'media';
          existing.category = st.category || 'personal';
          existing.dueDate = st.dueDate || st.due_date || '';
          await this.insertTask(existing);
        }
      } else {
        // Nueva tarea desde el servidor que no tenemos en local
        const newTask: Task = {
          id: 'srv_' + serverId,
          user_id: userId != null ? userId : (st.user_id ?? null),
          server_id: serverId,
          title: st.title || '',
          description: st.description ?? '',
          imageUrl: st.imageUrl || st.image_url || '',
          completed: !!st.completed,
          priority: st.priority || 'media',
          category: st.category || 'personal',
          dueDate: st.dueDate || st.due_date || '',
          createdAt: st.created_at ? new Date(st.created_at).getTime() : Date.now(),
          updatedAt: st.updated_at ? new Date(st.updated_at).getTime() : Date.now(),
          sync_status: 'synced'
        };
        await this.insertTask(newTask);
      }
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      user_id: row.user_id ?? null,
      server_id: row.server_id ? Number(row.server_id) : null,
      title: row.title,
      description: row.description || '',
      imageUrl: row.imageUrl || '',
      completed: row.completed === 1 || row.completed === true,
      priority: row.priority || 'media',
      category: row.category || 'personal',
      dueDate: row.dueDate || '',
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      sync_status: (row.sync_status || 'synced') as SyncStatus
    };
  }

  private async ensureReady(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  // ==========================================
  // FALLBACK INDEXEDDB (Para desarrollo en Web)
  // ==========================================

  private idbInstance: IDBDatabase | null = null;

  private async initWebFallback(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.idbName, 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.idbStore)) {
          db.createObjectStore(this.idbStore, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event: any) => {
        this.idbInstance = event.target.result;
        resolve();
      };
      request.onerror = (err) => {
        console.error('Error abriendo IndexedDB fallback:', err);
        resolve();
      };
    });
  }

  private async idbGetAll(): Promise<Task[]> {
    if (!this.idbInstance) return [];
    return new Promise((resolve) => {
      const tx = this.idbInstance!.transaction(this.idbStore, 'readonly');
      const store = tx.objectStore(this.idbStore);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  private async idbGet(id: string): Promise<Task | null> {
    if (!this.idbInstance) return null;
    return new Promise((resolve) => {
      const tx = this.idbInstance!.transaction(this.idbStore, 'readonly');
      const store = tx.objectStore(this.idbStore);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  private async idbPut(task: Task): Promise<void> {
    if (!this.idbInstance) return;
    return new Promise((resolve, reject) => {
      const tx = this.idbInstance!.transaction(this.idbStore, 'readwrite');
      const store = tx.objectStore(this.idbStore);
      const req = store.put(task);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async idbDelete(id: string): Promise<void> {
    if (!this.idbInstance) return;
    return new Promise((resolve, reject) => {
      const tx = this.idbInstance!.transaction(this.idbStore, 'readwrite');
      const store = tx.objectStore(this.idbStore);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
