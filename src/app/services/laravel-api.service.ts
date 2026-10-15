import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Task } from '../models/task.model';
import { NetworkService } from './network.service';

const STORAGE_API_KEY = 'laravel_api_base_url';

@Injectable({
  providedIn: 'root'
})
export class LaravelApiService {
  private defaultUrl = environment.apiUrl || 'http://127.0.0.1:8000/api';

  constructor(
    private http: HttpClient,
    private networkService: NetworkService
  ) {}

  /**
   * Obtiene la URL base configurada para la API de Laravel
   */
  getApiUrl(): string {
    const saved = localStorage.getItem(STORAGE_API_KEY);
    return (saved && saved.trim()) ? saved.trim() : this.defaultUrl;
  }

  /**
   * Guarda una nueva URL base y prueba la conexión inmediatamente
   */
  setApiUrl(url: string): void {
    if (url && url.trim()) {
      localStorage.setItem(STORAGE_API_KEY, url.trim().replace(/\/+$/, ''));
      this.networkService.checkServerNow();
    }
  }

  private getHeaders(userId?: number | string | null): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    if (userId != null) {
      headers = headers.set('X-User-Id', String(userId));
    }
    return headers;
  }

  /**
   * Prueba si la API de Laravel responde utilizando el endpoint /ping
   */
  async ping(): Promise<boolean> {
    try {
      const url = `${this.getApiUrl()}/ping`;
      await firstValueFrom(
        this.http.get(url, { headers: this.getHeaders() }).pipe(timeout(2000))
      );
      this.networkService.reportServerUp();
      return true;
    } catch {
      this.networkService.reportServerDown();
      return false;
    }
  }

  /**
   * Obtiene las tareas del usuario desde Laravel
   */
  async fetchTasks(userId?: number | string | null): Promise<any[]> {
    try {
      let url = `${this.getApiUrl()}/tasks`;
      if (userId != null) {
        url += `?user_id=${encodeURIComponent(String(userId))}`;
      }
      const response: any = await firstValueFrom(
        this.http.get(url, { headers: this.getHeaders(userId) }).pipe(timeout(3500))
      );
      this.networkService.reportServerUp();
      return Array.isArray(response) ? response : (response?.data || []);
    } catch (err: any) {
      if (err.status === 0 || !err.status) {
        this.networkService.reportServerDown();
      }
      throw err;
    }
  }

  /**
   * Crea una nueva tarea en Laravel asociada al usuario correspondiente
   */
  async createTask(task: Task, userId?: number | string | null): Promise<any> {
    try {
      const url = `${this.getApiUrl()}/tasks`;
      const actualUserId = userId ?? task.user_id ?? null;
      const payload = {
        title: task.title,
        description: task.description || null,
        imageUrl: task.imageUrl || null,
        completed: task.completed ? 1 : 0,
        priority: task.priority,
        category: task.category,
        dueDate: task.dueDate || null,
        client_id: task.id,
        user_id: actualUserId != null ? (Number(actualUserId) || actualUserId) : null
      };

      const response: any = await firstValueFrom(
        this.http.post(url, payload, { headers: this.getHeaders(actualUserId) }).pipe(timeout(4000))
      );
      this.networkService.reportServerUp();
      return response?.data || response;
    } catch (err: any) {
      if (err.status === 0 || !err.status) {
        this.networkService.reportServerDown();
      }
      throw err;
    }
  }

  /**
   * Actualiza una tarea en Laravel por su server_id
   */
  async updateTask(serverId: number, task: Task, userId?: number | string | null): Promise<any> {
    try {
      const url = `${this.getApiUrl()}/tasks/${serverId}`;
      const actualUserId = userId ?? task.user_id ?? null;
      const payload = {
        title: task.title,
        description: task.description || null,
        imageUrl: task.imageUrl || null,
        completed: task.completed ? 1 : 0,
        priority: task.priority,
        category: task.category,
        dueDate: task.dueDate || null,
        user_id: actualUserId != null ? (Number(actualUserId) || actualUserId) : null
      };

      const response: any = await firstValueFrom(
        this.http.put(url, payload, { headers: this.getHeaders(actualUserId) }).pipe(timeout(4000))
      );
      this.networkService.reportServerUp();
      return response?.data || response;
    } catch (err: any) {
      if (err.status === 0 || !err.status) {
        this.networkService.reportServerDown();
      }
      throw err;
    }
  }

  /**
   * Elimina una tarea en Laravel por su server_id
   */
  async deleteTask(serverId: number, userId?: number | string | null): Promise<boolean> {
    try {
      const url = `${this.getApiUrl()}/tasks/${serverId}`;
      await firstValueFrom(
        this.http.delete(url, { headers: this.getHeaders(userId) }).pipe(timeout(4000))
      );
      this.networkService.reportServerUp();
      return true;
    } catch (err: any) {
      if (err.status === 0 || !err.status) {
        this.networkService.reportServerDown();
      }
      throw err;
    }
  }
}
