export type TaskPriority = 'baja' | 'media' | 'alta';
export type TaskCategory = 'personal' | 'trabajo' | 'estudio' | 'otro';
export type SyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete';

export interface Task {
  id: string; // Identificador local único
  server_id?: number | null; // ID en Laravel API
  title: string;
  description?: string;
  imageUrl?: string;
  completed: boolean;
  priority: TaskPriority;
  category: TaskCategory;
  createdAt: number;
  updatedAt?: number;
  dueDate?: string;
  sync_status: SyncStatus; // Estado de sincronización SQLite <-> Laravel API
}

export interface UserProfile {
  id?: number | string;
  name: string;
  email: string;
  token?: string;
}
