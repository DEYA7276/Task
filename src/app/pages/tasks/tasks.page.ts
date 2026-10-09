import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonContent,
  IonChip,
  IonIcon,
  IonFab,
  IonFabButton,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonProgressBar,
  IonSpinner,
  IonLabel,
  IonBadge,
  ModalController,
  AlertController,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  ellipseOutline,
  trashOutline,
  createOutline,
  timeOutline,
  calendarOutline,
  searchOutline,
  filterOutline,
  alertCircleOutline,
  folderOutline,
  flagOutline,
  sparklesOutline,
  refreshOutline,
  personCircleOutline,
  chevronForwardOutline,
  cloudDoneOutline,
  cloudUploadOutline,
  cloudOfflineOutline,
  serverOutline,
  settingsOutline,
  wifiOutline,
  logOutOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { TaskService } from '../../services/task.service';
import { LaravelApiService } from '../../services/laravel-api.service';
import { Task, TaskCategory, TaskPriority } from '../../models/task.model';
import { TaskModalComponent } from '../../components/task-modal/task-modal.component';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.page.html',
  styleUrls: ['./tasks.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonChip,
    IonIcon,
    IonFab,
    IonFabButton,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonProgressBar,
    IonSpinner,
    IonLabel,
    IonBadge
  ]
})
export class TasksPage implements OnInit, OnDestroy {
  tasks: Task[] = [];
  isLoading: boolean = true;
  isOnline: boolean = true;
  isSyncing: boolean = false;
  pendingCount: number = 0;
  apiUrl: string = '';

  userName: string = 'Usuario';
  userEmail: string = '';

  // Filtros
  searchTerm: string = '';
  statusFilter: 'todas' | 'pendientes' | 'completadas' = 'todas';
  categoryFilter: string = 'todas';

  private tasksSub?: Subscription;
  private loadingSub?: Subscription;
  private onlineSub?: Subscription;
  private syncingSub?: Subscription;
  private pendingSub?: Subscription;
  private userSub?: Subscription;

  public authService = inject(AuthService);
  private taskService = inject(TaskService);
  private laravelApi = inject(LaravelApiService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      addOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      ellipseOutline,
      trashOutline,
      createOutline,
      timeOutline,
      calendarOutline,
      searchOutline,
      filterOutline,
      alertCircleOutline,
      folderOutline,
      flagOutline,
      sparklesOutline,
      refreshOutline,
      personCircleOutline,
      chevronForwardOutline,
      cloudDoneOutline,
      cloudUploadOutline,
      cloudOfflineOutline,
      serverOutline,
      settingsOutline,
      wifiOutline,
      logOutOutline
    });
  }

  ngOnInit() {
    this.apiUrl = this.laravelApi.getApiUrl();

    this.userSub = this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.userName = user.name || user.email?.split('@')[0] || 'Usuario';
        this.userEmail = user.email || '';
      }
      this.cdr.detectChanges();
    });

    this.loadingSub = this.taskService.loading$.subscribe((loading) => {
      this.isLoading = loading;
      this.cdr.detectChanges();
    });

    this.tasksSub = this.taskService.tasks$.subscribe((tasks) => {
      this.tasks = tasks;
      this.cdr.detectChanges();
    });

    this.onlineSub = this.taskService.isOnline$.subscribe((online) => {
      this.isOnline = online;
      this.cdr.detectChanges();
    });

    this.syncingSub = this.taskService.isSyncing$.subscribe((syncing) => {
      this.isSyncing = syncing;
      this.cdr.detectChanges();
    });

    this.pendingSub = this.taskService.pendingCount$.subscribe((count) => {
      this.pendingCount = count;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.tasksSub?.unsubscribe();
    this.loadingSub?.unsubscribe();
    this.onlineSub?.unsubscribe();
    this.syncingSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  get completedCount(): number {
    return this.tasks.filter((t) => t.completed).length;
  }

  get incompletedCount(): number {
    return this.tasks.filter((t) => !t.completed).length;
  }

  get progressRatio(): number {
    if (this.tasks.length === 0) return 0;
    return this.completedCount / this.tasks.length;
  }

  get filteredTasks(): Task[] {
    return this.tasks.filter((task) => {
      if (this.statusFilter === 'pendientes' && task.completed) return false;
      if (this.statusFilter === 'completadas' && !task.completed) return false;

      if (this.categoryFilter !== 'todas' && task.category !== this.categoryFilter) return false;

      if (this.searchTerm && this.searchTerm.trim().length > 0) {
        const query = this.searchTerm.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = (task.description || '').toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }

      return true;
    });
  }

  async openAddTaskModal() {
    const modal = await this.modalCtrl.create({
      component: TaskModalComponent,
      canDismiss: true
    });

    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      try {
        await this.taskService.addTask(data);
        if (this.isOnline) {
          await this.showToast('Guardado en SQLite local y sincronizando con Laravel...', 'success');
        } else {
          await this.showToast('Guardado en SQLite local (Modo sin conexión)', 'warning');
        }
      } catch (err: any) {
        await this.showToast(err.message || 'Error al guardar tarea', 'danger');
      }
    }
  }

  async openEditTaskModal(task: Task, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    const modal = await this.modalCtrl.create({
      component: TaskModalComponent,
      componentProps: { task },
      canDismiss: true
    });

    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data && task.id) {
      try {
        await this.taskService.updateTask(task.id, data);
        await this.showToast('Tarea actualizada en SQLite local', 'success');
      } catch (err: any) {
        await this.showToast(err.message || 'Error al actualizar', 'danger');
      }
    }
  }

  async toggleTask(task: Task, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    try {
      await this.taskService.toggleTaskComplete(task);
    } catch (err: any) {
      await this.showToast(err.message || 'Error al cambiar estado', 'danger');
    }
  }

  async confirmDeleteTask(task: Task, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar Tarea',
      subHeader: task.title,
      message: '¿Estás seguro de que deseas eliminar esta tarea de SQLite y Laravel?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            if (task.id) {
              try {
                await this.taskService.deleteTask(task.id);
                await this.showToast('Tarea eliminada correctamente', 'medium');
              } catch (err: any) {
                await this.showToast(err.message || 'Error al eliminar', 'danger');
              }
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async manualSync() {
    if (!this.isOnline) {
      await this.showToast('Sin conexión a internet. Los datos permanecen guardados en SQLite.', 'warning');
      return;
    }

    try {
      const res = await this.taskService.syncNow();
      if (res.success) {
        await this.showToast(`Sincronización exitosa (${res.syncedCount} cambios sincronizados)`, 'success');
      } else {
        await this.showToast(res.message || 'Error sincronizando con Laravel API', 'warning');
      }
    } catch (err: any) {
      await this.showToast('No se pudo conectar con el API de Laravel. Verifica que el servidor esté activo.', 'danger');
    }
  }

  async openApiSettings() {
    const alert = await this.alertCtrl.create({
      header: 'Configurar Laravel API',
      subHeader: 'URL del Backend',
      message: 'Indica la dirección del servidor Laravel (ejemplo: http://127.0.0.1:8000/api)',
      inputs: [
        {
          name: 'apiUrl',
          type: 'url',
          placeholder: 'http://127.0.0.1:8000/api',
          value: this.laravelApi.getApiUrl()
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Guardar y Probar',
          handler: async (data) => {
            if (data?.apiUrl) {
              this.laravelApi.setApiUrl(data.apiUrl);
              this.apiUrl = this.laravelApi.getApiUrl();
              await this.showToast('URL de Laravel guardada. Probando conexión...', 'medium');
              const pingOk = await this.laravelApi.ping();
              if (pingOk) {
                await this.showToast('¡Conexión exitosa con el API de Laravel!', 'success');
                this.manualSync();
              } else {
                await this.showToast('URL guardada, pero no responde. Asegúrate de ejecutar "php artisan serve"', 'warning');
              }
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async confirmLogout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas salir de tu cuenta?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          role: 'destructive',
          handler: async () => {
            await this.authService.logout();
            this.router.navigate(['/login'], { replaceUrl: true });
            await this.showToast('Has cerrado sesión correctamente', 'medium');
          }
        }
      ]
    });

    await alert.present();
  }

  formatDate(timestamp?: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  }

  getPriorityColor(priority: TaskPriority): string {
    switch (priority) {
      case 'alta':
        return 'danger';
      case 'media':
        return 'warning';
      case 'baja':
        return 'success';
      default:
        return 'medium';
    }
  }

  getCategoryIcon(category: TaskCategory): string {
    switch (category) {
      case 'personal':
        return 'personCircleOutline';
      case 'trabajo':
        return 'folderOutline';
      case 'estudio':
        return 'sparklesOutline';
      default:
        return 'alertCircleOutline';
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2800,
      position: 'bottom',
      color
    });
    await toast.present();
  }
}
