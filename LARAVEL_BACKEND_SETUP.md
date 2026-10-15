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

### Verificación de Estado (Health Check)
| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/ping` | Responde con estado 200 para comprobar al instante si el servidor Laravel está activo |

### Gestión de Tareas (Aisladas por Usuario)
| Método | Endpoint | Parámetros / Headers | Descripción |
|---|---|---|---|
| `GET` | `/api/tasks` | `user_id` o Header `X-User-Id` | Listar únicamente las tareas pertenecientes al usuario |
| `POST` | `/api/tasks` | Datos tarea + `user_id` | Crear tarea vinculada al usuario |
| `GET` | `/api/tasks/{id}` | *(ninguno)* | Obtener detalle de una tarea |
| `PUT` | `/api/tasks/{id}` | Datos modificados | Actualizar cambios de una tarea |
| `DELETE` | `/api/tasks/{id}` | *(ninguno)* | Eliminar una tarea |

---

## 📱 Funcionamiento en Ionic (`Task_Dey`)

1. **Aislamiento Total de Tareas por Usuario**:
   - Cada usuario que registra o inicia sesión solo tiene acceso a sus propias tareas.
   - En SQLite / almacenamiento local, las tareas están etiquetadas con `user_id`, evitando que usuarios en la misma app vean tareas de otros.
   - En Laravel, las consultas filtran estrictamente por el `user_id` del usuario autenticado.

2. **Detección Directa del Servidor Laravel (Sin Depender de Internet)**:
   - La aplicación **no depende de si tu PC tiene conexión a internet**. En su lugar, comprueba directamente si el servidor local de Laravel (`php artisan serve`) está encendido.
   - **Si el servidor está apagado o se cae**: Puedes agregar, editar o eliminar tareas sin interrupciones ni bloqueos; se almacenan inmediatamente en SQLite / local con estado pendiente y el indicador marca "Servidor Apagado".
   - **Al encender el servidor**: La app detecta automáticamente la reconexión y sincroniza todos los cambios pendientes con la base de datos de Laravel sin necesidad de intervención manual.
