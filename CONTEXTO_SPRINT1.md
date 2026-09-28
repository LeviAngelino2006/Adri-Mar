# Contexto del Sprint 1 – Adri-mar Gestión

Proyecto académico (UTN FRC, Seminario Integrador 3K1, Grupo 6): sistema de gestión y documentación de mantenimiento de vehículos para Adri-mar, empresa de transporte de pasajeros de Río Tercero (Córdoba).

Este archivo va en la raíz del repositorio (o en `docs/`) y es la fuente de verdad para el desarrollo del Sprint 1. Los criterios de aceptación también están en la descripción de cada ticket en Jira (proyecto SCRUM).

## Stack

- Frontend: React
- Backend: Node.js + Express (API REST)
- Base de datos: MySQL, accedida con **Prisma** (ORM)
- Gestión: Jira (proyecto SCRUM). Código en GitHub.

## Estructura del repositorio

```
adrimar-gestion/
├─ frontend/                 (React)
├─ backend/                  (Node.js + Express)
│  ├─ src/
│  │  ├─ controllers/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ middlewares/
│  ├─ prisma/
│  │  ├─ schema.prisma       (reemplaza a la carpeta models/ del Sprint 0)
│  │  ├─ migrations/
│  │  └─ seed.js             (Administrador inicial)
│  └─ tests/
├─ database/
│  └─ diagramas/             (DER)
├─ docs/
└─ README.md
```

Nota: el Sprint 0 preveía `backend/src/models/` y `database/scripts/`. Con Prisma, el esquema y las migraciones viven en `backend/prisma/`. Donde los tickets digan `database/scripts/`, leer `backend/prisma/`.

## Ramas y commits

- `main`: versión estable. `develop`: integración.
- Una rama por User Story, creada desde `develop`: `feature/US-<número>-<descripción-corta>` (ej. `feature/US-32-iniciar-sesion`).
- Cada commit y cada Pull Request menciona la clave de Jira (ej. `SCRUM-32: agrega endpoint de login`).

## Decisiones técnicas

- **ORM:** Prisma sobre MySQL, con migraciones versionadas. Usar la misma versión de Prisma que en el proyecto DepoStock y seguir la documentación de esa versión para generator y datasource.
- **Contraseñas:** hash con `bcrypt`. Nunca en texto plano ni en logs.
- **Sesión:** JWT. Se renueva en cada petición autenticada (el backend devuelve un token nuevo en cada respuesta y el frontend reemplaza el anterior). La sesión se cierra tras un período **sin ninguna petición**, configurable por perfil en `.env`:
  - `SESSION_TTL_CHOFER_MIN=720` (12 h, para los choferes)
  - `SESSION_TTL_OTROS_MIN=60` (1 h, para el resto de los perfiles)
- **Seed del Administrador inicial:** usuario y contraseña tomados de variables de entorno, sin valores fijos en el repositorio.
- **Errores de login:** mensaje genérico, sin indicar si falló el usuario o la contraseña.

## Modelo de datos (versión Sprint 1)

```prisma
// Completar generator y datasource según la versión de Prisma instalada.

enum Perfil {
  ADMINISTRADOR
  PERSONAL_TALLER
  LOGISTICA
  GERENCIA_GENERAL
  CHOFER
}

enum EstadoVehiculo {
  OPERATIVO
  EN_TALLER
  DADO_DE_BAJA
}

model Usuario {
  id             Int      @id @default(autoincrement())
  nombre         String
  apellido       String
  nombreUsuario  String   @unique @map("nombre_usuario")
  contrasenaHash String   @map("contrasena_hash")
  perfil         Perfil
  activo         Boolean  @default(true)
  creadoEn       DateTime @default(now()) @map("creado_en")

  @@map("usuarios")
}

model Vehiculo {
  id            Int            @id @default(autoincrement())
  dominio       String         @unique
  numeroInterno String         @map("numero_interno")
  marca         String
  modelo        String
  anio          Int
  asientos      Int
  kilometraje   Int
  estado        EstadoVehiculo @default(OPERATIVO)
  fechaBaja     DateTime?      @map("fecha_baja")
  creadoEn      DateTime       @default(now()) @map("creado_en")

  @@map("vehiculos")
}
```

Etiquetas visibles para el usuario: Operativo, En taller, Dado de baja; Administrador, Personal de Taller, Logística, Gerencia General, Chofer.

## Orden de trabajo

1. Setup: repositorio, backend Express, frontend React, MySQL con Prisma, README (SCRUM-42 a SCRUM-46).
2. SCRUM-32 Iniciar sesión.
3. SCRUM-24 Registrar usuario y asignar perfil.
4. SCRUM-12 Registrar nuevo vehículo.
5. SCRUM-33 Consultar flota de vehículos.
6. SCRUM-13 Modificar datos de vehículo.
7. SCRUM-14 Dar de baja vehículo.

Si el tiempo no alcanza, se corta por el final de la lista.

## Criterios de aceptación

### SCRUM-32 · Iniciar sesión

- CA1. El usuario ingresa usuario y contraseña, y si son correctos accede al sistema.
- CA2. Al ingresar, se muestran solo las funciones habilitadas para su perfil (Administrador, Personal de Taller, Logística, Gerencia General o Chofer).
- CA3. Si el usuario o la contraseña son incorrectos, se muestra un mensaje genérico ("Usuario o contraseña incorrectos") sin indicar cuál de los dos falló.
- CA4. Un usuario dado de baja o inactivo no puede iniciar sesión.
- CA5. La contraseña nunca se guarda ni se transmite en texto plano (se almacena con hash).
- CA6. Las pantallas del sistema no son accesibles sin sesión iniciada: se redirige al login.
- CA7. El usuario puede cerrar sesión, y la sesión expira por inactividad (tiempo por perfil, ver Decisiones técnicas).

### SCRUM-24 · Registrar usuario y asignar perfil

- CA1. Solo el perfil Administrador puede acceder a esta función.
- CA2. Se registran: nombre, apellido, nombre de usuario, contraseña y perfil (obligatorios los cinco).
- CA3. El nombre de usuario debe ser único; si ya existe, se informa y no se guarda.
- CA4. La contraseña debe tener un mínimo de 8 caracteres y se almacena con hash.
- CA5. El perfil se elige de una lista cerrada: Administrador, Personal de Taller, Logística, Gerencia General, Chofer.
- CA6. Si falta algún dato obligatorio, se marca el campo y no se guarda.
- CA7. Al guardar, se muestra un mensaje de confirmación y el nuevo usuario puede iniciar sesión.

### SCRUM-12 · Registrar nuevo vehículo (CORE)

- CA1. Solo el perfil Administrador puede registrar vehículos.
- CA2. Se registran: dominio (patente), número de interno, marca, modelo, año, cantidad de asientos y kilometraje actual (obligatorios todos).
- CA3. El dominio debe ser único; si ya existe, se informa y no se guarda.
- CA4. El dominio se valida con formato de patente argentina (ej. AB123CD o ABC123).
- CA5. El año debe ser un número válido (no futuro) y el kilometraje debe ser un número mayor o igual a 0.
- CA6. El vehículo queda registrado con estado "Operativo".
- CA7. Si falta algún dato obligatorio o hay un dato inválido, se marca el campo y no se guarda.
- CA8. Al guardar, se muestra un mensaje de confirmación y el vehículo aparece en el listado de la flota.

### SCRUM-33 · Consultar flota de vehículos

- CA1. Pueden acceder los perfiles Administrador y Personal de Taller.
- CA2. El listado muestra: dominio, número de interno, marca y modelo, kilometraje y estado.
- CA3. Por defecto se muestran los vehículos que no están dados de baja (estados "Operativo" y "En taller"); con un filtro por estado se pueden ver también los "Dado de baja".
- CA4. Se puede buscar por dominio, número de interno o marca.
- CA5. Al seleccionar un vehículo se muestra su ficha con todos los datos registrados.
- CA6. Si no hay resultados, se muestra el mensaje "No se encontraron vehículos".

### SCRUM-13 · Modificar datos de vehículo

- CA1. Solo el perfil Administrador puede modificar vehículos.
- CA2. Se puede editar cualquier dato registrado del vehículo, partiendo de los valores actuales.
- CA3. Se aplican las mismas validaciones que en el alta (dominio único con formato válido, año y kilometraje válidos, obligatorios completos).
- CA4. Al modificar el dominio, no puede coincidir con el de otro vehículo.
- CA5. No se puede modificar un vehículo dado de baja.
- CA6. Al guardar, se muestra un mensaje de confirmación y el listado refleja los cambios.
- CA7. Si el usuario cancela, no se aplica ningún cambio.

### SCRUM-14 · Dar de baja vehículo

- CA1. Solo el perfil Administrador puede dar de baja vehículos.
- CA2. Antes de confirmar, se pide confirmación explícita, mostrando dominio e interno del vehículo.
- CA3. La baja es lógica: el vehículo cambia a estado "Dado de baja", se registra la fecha y no se elimina de la base de datos.
- CA4. Un vehículo dado de baja no aparece por defecto en el listado ni queda disponible para operaciones nuevas (viajes, mantenimientos).
- CA5. Se conserva todo su historial.
- CA6. Si el vehículo ya está dado de baja, no se puede dar de baja de nuevo.
- CA7. Al confirmar, se muestra un mensaje de éxito.

## Definición de terminado (por US)

- Todos los criterios de aceptación se cumplen y fueron probados a mano.
- Las validaciones se aplican en backend, no solo en el frontend.
- Los permisos por perfil se verifican en backend con el middleware de autorización.
- Pull Request a `develop` que referencia el ticket de Jira.

## Reportes

Al terminar cada tarea, escribí el reporte en español: qué hiciste, qué archivos creaste o modificaste, cómo lo probaste y qué quedó pendiente.
