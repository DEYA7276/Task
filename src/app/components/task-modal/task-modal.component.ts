import { Component, Input, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonFooter,
  ModalController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  checkmarkOutline,
  calendarOutline,
  flagOutline,
  folderOutline,
  createOutline,
  addCircleOutline,
  cameraOutline,
  imageOutline,
  trashOutline,
  cloudUploadOutline
} from 'ionicons/icons';
import { Task, TaskCategory, TaskPriority } from '../../models/task.model';

@Component({
  selector: 'app-task-modal',
  templateUrl: './task-modal.component.html',
  styleUrls: ['./task-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonFooter
  ]
})
export class TaskModalComponent implements OnInit {
  @Input() task?: Task;

  title: string = '';
  description: string = '';
  imageUrl: string = '';
  priority: TaskPriority = 'media';
  category: TaskCategory = 'personal';
  dueDate: string = '';

  isEditMode: boolean = false;
  submitted: boolean = false;
  isProcessingImage: boolean = false;

  private modalCtrl = inject(ModalController);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    addIcons({
      closeOutline,
      checkmarkOutline,
      calendarOutline,
      flagOutline,
      folderOutline,
      createOutline,
      addCircleOutline,
      cameraOutline,
      imageOutline,
      trashOutline,
      cloudUploadOutline
    });
  }

  ngOnInit() {
    if (this.task) {
      this.isEditMode = true;
      this.title = this.task.title;
      this.description = this.task.description || '';
      this.imageUrl = this.task.imageUrl || '';
      this.priority = this.task.priority || 'media';
      this.category = this.task.category || 'personal';
      this.dueDate = this.task.dueDate || '';
    }
  }

  onFileSelected(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;

    // Verificar que sea una imagen
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido.');
      return;
    }

    this.isProcessingImage = true;
    this.cdr.detectChanges();

    const reader = new FileReader();

    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar la imagen a máx 600px para carga ultrarrápida
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          this.imageUrl = canvas.toDataURL('image/jpeg', 0.65);
        }
        this.isProcessingImage = false;
        // Forzar renderizado instantáneo en Angular sin esperar cambios de foco
        this.cdr.detectChanges();
      };
      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  }

  removeImage() {
    this.imageUrl = '';
    this.cdr.detectChanges();
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save() {
    this.submitted = true;
    if (!this.title || this.title.trim().length === 0) {
      return;
    }

    const taskData = {
      title: this.title.trim(),
      description: this.description.trim(),
      imageUrl: this.imageUrl,
      priority: this.priority,
      category: this.category,
      dueDate: this.dueDate
    };

    this.modalCtrl.dismiss(taskData, 'confirm');
  }
}
