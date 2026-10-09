import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom, of } from 'rxjs';
import { timeout, catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Task } from '../models/task.model';

const STORAGE_API_KEY = 'laravel_api_base_url';

@Injectable({
  providedIn: 'root'
})
export class LaravelApiService {
  private defaultUrl = environment.apiUrl || 'http://127.0.0.1:8000/api';

  constructor(private http: HttpClient) {}

  /**
   * Obtiene la URL base configurada para la API de Laravel
   */
  getApiUrl(): string {
    const saved = localStorage.getItem(STORAGE_API_KEY);
    return (saved && saved.trim()) ? saved.trim() : this.defaultUrl;
  }

  /**
   * Guarda una nueva URL base (por ejemplo si se prueba en emulador o dispositivo móvil)
   */
  setApiUrl(url: string): void {
    if (url && url.trim()) {
      localStorage.setItem(STORAGE_API_KEY, url.trim().replace(/\/+$/, ''));
    }
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  /**
   * Prueba si la API de Laravel responde
   */
  async ping(): Promise<boolean> {
    try {
      const url = `${this.getApiUrl()}/tasks`;
      await firstValueFrom(
        this.http.get(url, { headers: this.getHeaders() }).pipe(timeout(4000))
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene todas las tareas del backend de Laravel
   */
  async fetchTasks(): Promise<any[]> {
    const url = `${this.getApiUrl()}/tasks`;
    const response: any = await firstValueFrom(
      this.http.get(url, { headers: this.getHeaders() }).pipe(timeout(6000))
    );
    // Compatible si Laravel devuelve [ ... ] o { data: [ ... ] }
    return Array.isArray(response) ? response : (response?.data || []);
  }

  /**
   * Crea una nueva tarea en Laravel
   */
  async createTask(task: Task): Promise<any> {
    const url = `${this.getApiUrl()}/tasks`;
    const payload = {
      title: task.title,
      description: task.description || null,
      imageUrl: task.imageUrl || null,
      completed: task.completed ? 1 : 0,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate || null,
      client_id: task.id // ID temporal del cliente
    };

    const response: any = await firstValueFrom(
      this.http.post(url, payload, { headers: this.getHeaders() }).pipe(timeout(8000))
    );
    return response?.data || response;
  }

  /**
   * Actualiza una tarea en Laravel por su server_id
   */
  async updateTask(serverId: number, task: Task): Promise<any> {
    const url = `${this.getApiUrl()}/tasks/${serverId}`;
    const payload = {
      title: task.title,
      description: task.description || null,
      imageUrl: task.imageUrl || null,
      completed: task.completed ? 1 : 0,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate || null
    };

    const response: any = await firstValueFrom(
      this.http.put(url, payload, { headers: this.getHeaders() }).pipe(timeout(8000))
    );
    return response?.data || response;
  }

  /**
   * Elimina una tarea en Laravel por su server_id
   */
  async deleteTask(serverId: number): Promise<boolean> {
    const url = `${this.getApiUrl()}/tasks/${serverId}`;
    await firstValueFrom(
      this.http.delete(url, { headers: this.getHeaders() }).pipe(timeout(8000))
    );
    return true;
  }
}
