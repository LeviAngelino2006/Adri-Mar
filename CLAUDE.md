# Adri-Mar Gestión

## Qué es este sistema
Sistema de gestión de flota, documentación vehicular, legajos de choferes, viajes especiales y mantenimiento preventivo de colectivos para Adri-Mar, empresa de transporte de pasajeros de Río Tercero (Córdoba).
Es utilizado por Administradores, Encargados, Personal de Taller y Choferes para coordinar la flota, controlar vencimientos de documentación reglamentaria, gestionar reservas/despacho de viajes y registrar lecturas de odómetro.
Desarrollado como seminario integrador de Ingeniería en Sistemas de Información (UTN FRC, Grupo 6).

## Reglas de negocio importantes
- Mantenimiento preventivo:
  - En el código actual: pendiente de implementación (`TODO: SCRUM-34`). Solo existe el origen de lectura de odómetro `MANTENIMIENTO`.
  - En el relevamiento operativo (`docs/INFORMACION_ADICIONAL.md`): el mantenimiento preventivo se dispara por umbrales de kilometraje según el tipo de vehículo: Colectivo (cada 20.000 km), Minibús (cada 20.000 km), Tráfic/Combi (cada 15.000 km) y Utilitario (cada 10.000 km).
  - Tareas de service: cambio de aceite y filtros, alineación/balanceo y revisión general de frenos y fluidos.
- Documentos de vehículos y choferes:
  - Control de vigencia: `VIGENTE` (al día o sin vencimiento), `POR_VENCER` (vence en 30 días o menos), `VENCIDO` (fecha de vencimiento anterior a la fecha actual), `PENDIENTE` (no cargado).
  - Documentos de vehículos: Póliza de Seguro (vence, requiere PDF), Certificado de Cobertura (vence, requiere PDF), Comprobante de Pago de Seguro (mensual, requiere PDF), ITV (vence, requiere PDF), Matafuegos (vence, no requiere PDF), Título del Automotor (no vence, requiere PDF), Cédula de Identificación / Tarjeta Verde (no vence, requiere PDF) y Certificado de Alta de Transporte (no vence, requiere PDF).
  - Documentos de choferes: Licencia de Conducir profesional (vence, requiere PDF), DNI (no vence, requiere PDF) y Examen Psicofísico / LINTI (vence, requiere PDF).
  - Regla de historial y purga: Por cada tipo de documento se conservan hasta 2 archivos históricos + 1 actual vigente (máximo 3 en total). Si se carga uno nuevo que supere el límite, se purga automáticamente el más antiguo de la base de datos y de Supabase Storage.
  - Renovación de documentos: se permite renovar fechas/observaciones conservando el archivo PDF previo sin forzar una nueva subida.
- Estados posibles:
  - Vehículo: `OPERATIVO`, `EN_TALLER`, `DADO_DE_BAJA` (baja lógica conservando historial y fecha de baja).
  - Viaje: `A_CONFIRMAR` (estado inicial, permite choferes y vehículos candidatos sin bloquear solapamientos), `PROGRAMADO` (confirmado con 1 chofer y 1 vehículo tras validar disponibilidad), `EN_VIAJE`, `FINALIZADO`, `CANCELADO`.
  - Documento (vigencia): `VIGENTE`, `POR_VENCER`, `VENCIDO`, `PENDIENTE`.
  - Pago cliente / chofer: `PENDIENTE`, `PAGADO`, `PARCIAL`.
  - Métodos de pago: `EFECTIVO`, `BANCO`, `CHEQUE`.
  - Usuario: `ACTIVO`, `INACTIVO`.
  - Perfiles de usuario: `ADMINISTRADOR`, `ENCARGADO`, `PERSONAL_TALLER`, `CHOFER`.
  - Mantenimiento: `TODO: completar por el equipo` (definir estados al implementar la tabla de planes/órdenes de trabajo en `SCRUM-34`).
- Odómetro y viajes:
  - Registro continuo de kilometraje al inicio y fin de cada viaje.
  - El kilometraje no puede retroceder. En caso de correcciones, se registra una lectura vinculada a la errónea con motivo explícito.

## Stack
- Lenguaje y versión: Node.js 20+ (Backend), JavaScript ES2022+ / React 19 (Frontend).
- Framework(s): Express 5.2.1 (API REST), React 19.2.8 con Vite 8.3.0 y React Router DOM 7.18.4 (Frontend SPA).
- Base de datos: PostgreSQL (instancia en Supabase), administrada con Prisma ORM 6.19.3. Almacenamiento de archivos PDF en Supabase Storage con URLs firmadas (Signed URLs).
- Otras herramientas: Multer 2.4.0 (archivos multipart), Bcrypt 6.0.0 (hash de claves), JSON Web Token 9.0.3 (sesiones JWT con renovación continua), Oxlint 1.81.0 (linter frontend), Node Test Runner nativo (`node --test`), Nodemon 3.1.14.

## Estructura del proyecto
- `backend/`: API REST Node.js con Express, Prisma ORM y Supabase.
- `backend/src/controllers/`: Controladores de endpoints HTTP y manejo de peticiones/respuestas.
- `backend/src/middlewares/`: Middlewares Express para autenticación JWT, control de roles y carga de archivos.
- `backend/src/routes/`: Definición y enrutamiento modular de endpoints.
- `backend/src/services/`: Capa de servicios con la lógica de negocio, validaciones y acceso a datos.
- `backend/src/utils/`: Utilidades auxiliares (normalización de cadenas, nombres de ubicaciones y clientes).
- `backend/prisma/`: Esquema de Prisma (`schema.prisma`), migraciones versionadas y script de seed (`seed.js`).
- `backend/tests/`: Pruebas de integración automatizadas con simulación de estado en memoria.
- `frontend/`: Aplicación cliente SPA desarrollada con React y Vite.
- `frontend/src/components/`: Componentes UI reutilizables (botones, modales, tablas, badges, selectores).
- `frontend/src/constants/`: Constantes del sistema (perfiles, estados de viaje, estados de vehículo, rutas).
- `frontend/src/context/`: Contextos de React (`AuthContext` para sesión y usuario autenticado).
- `frontend/src/pages/`: Vistas del sistema (Login, Flota, Usuarios, Viajes, Mis Viajes, Documentación, Dashboard).
- `frontend/src/services/`: Clientes de API HTTP basados en Axios.
- `frontend/src/utils/`: Funciones auxiliares (manejo de fechas en huso de Córdoba UTC-3, WhatsApp, paradas, Google Maps).
- `database/`: Diseños y diagramas de entidad-relación (DER) de la base de datos.
- `docs/`: Documentación del sistema, handoffs técnicos, especificaciones de diseño y guías de dominio.

## Comandos
- Instalar dependencias: `cd backend && npm install` (backend) y `cd frontend && npm install` (frontend).
- Correr en desarrollo:
  - Backend: `cd backend && npm run dev` (corre con nodemon en `http://localhost:3000`).
  - Frontend: `cd frontend && npm run dev` (corre con Vite en `http://localhost:5173`).
- Tests:
  - Backend: `cd backend && npm test`
  - Frontend: `cd frontend && npm test`
- Linter / formato: `cd frontend && npm run lint`
- Build: `cd frontend && npm run build` (backend no requiere build al usar CommonJS directo).

## Convenciones
- Ramas: `feature/<CLAVE-JIRA>-<descripcion-corta>` (por ejemplo `feature/SCRUM-22-registrar-documentacion-vehiculo` o `feature/US-39-documentacion-chofer`), creadas a partir de `develop`. Versión estable en `main`.
- Commits: Conventional Commits indicando tipo y alcance o clave de ticket Jira (por ejemplo `feat(viajes): paradas intermedias en el recorrido`, `fix: preservacion de tildes en nombres de archivo` o `SCRUM-32: agrega endpoint de login`).
- Estilo de código: CommonJS en backend (`require`/`module.exports`), ESM en frontend (`import`/`export`), nombres de variables y funciones en camelCase, campos de base de datos mapeados con snake_case (`@map`), validaciones centralizadas arrojando `ValidacionError` con `erroresPorCampo`.
- Arquitectura: Arquitectura en capas desacopladas (Rutas -> Middlewares -> Controladores -> Servicios -> ORM Prisma / Supabase). Manejo estricto de fechas y horarios según hora local de Córdoba (UTC-3).

## Cómo trabajar con Claude
- Antes de implementar una historia, leer su descripción y criterios de aceptación en Jira.
- Respetar la arquitectura y las convenciones de este archivo.
- Correr los tests antes de dar una tarea por terminada.
- No leer ni modificar `.env` ni archivos de credenciales.
- Ante dudas sobre reglas de negocio, preguntar en lugar de asumir.

## Documentación
- Ver `docs/README.md` para el índice de documentos del proyecto.
