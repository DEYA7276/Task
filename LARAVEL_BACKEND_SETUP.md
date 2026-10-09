# Backend de Laravel para TaskDey (`laravel_tasks`)

Ubicación del proyecto independiente:
📁 **`C:\xampp\htdocs\laravel_tasks`**

Base de datos: **SQLite** (`database/database.sqlite`), sin dependencias de Firebase ni MySQL Workbench.

---

## 📍 Estructura del Backend

- **Autenticación**: `C:\xampp\htdocs\laravel_tasks\app\Http\Controllers\AuthController.php`
- **Controlador de Tareas**: `C:\xampp\htdocs\laravel_tasks\app\Http\Controllers\TaskController.php`
- **Modelos**:
  - `User.php` (Modelo de usuario con hash de contraseña)
  - `Task.php` (Modelo de tareas)
- **Base de Datos**: `C:\xampp\htdocs\laravel_tasks\database\database.sqlite`
- **Rutas API**: `C:\xampp\htdocs\laravel_tasks\routes\api.php`
- **CORS**: `C:\xampp\htdocs\laravel_tasks\config\cors.php` (Acceso completo para Ionic)

---

## 🚀 Cómo Iniciar el Backend

Abre una terminal y ejecuta:

```bash
cd C:\xampp\htdocs\laravel_tasks
php artisan serve --host=0.0.0.0 --port=8000
```

---

## 📡 Endpoints de la API

### Autenticación (Sin Firebase)
| Método | Endpoint | Parámetros | Descripción |
|---|---|---|---|
| `POST` | `/api/register` | `name`, `email`, `password` | Crear nueva cuenta |
| `POST` | `/api/login` | `email`, `password` | Iniciar sesión y autenticar |
| `POST` | `/api/logout` | *(ninguno)* | Cerrar sesión |

### Gestión de Tareas
| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/tasks` | Listar todas las tareas ordenadas por fecha |
| `POST` | `/api/tasks` | Crear tarea (sincronizada desde SQLite en Ionic) |
| `GET` | `/api/tasks/{id}` | Obtener detalle de una tarea |
| `PUT` | `/api/tasks/{id}` | Actualizar cambios de una tarea |
| `DELETE` | `/api/tasks/{id}` | Eliminar una tarea |

---

## 📱 Funcionamiento en Ionic (`Task_Dey`)

1. **Pantalla de Login / Registro**:
   - Permite crear cuenta o iniciar sesión conectándose directamente a tu API de Laravel.
   - En modo sin conexión (offline), permite acceder si las credenciales ya fueron validadas previamente.
2. **Tareas Offline-First**:
   - Cada tarea se guarda primero en SQLite local en Ionic.
   - Al tener conexión, se sincroniza automáticamente con tu backend en `laravel_tasks`.
3. **Cero Dependencias de Firebase**:
   - Toda la autenticación y datos ahora son gestionados por Laravel y SQLite.
