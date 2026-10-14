# Adri-Mar Gestión

Sistema de gestión de flota, documentación vehicular, legajos de choferes, viajes especiales, presupuestos y mantenimiento preventivo para **Adri-Mar**, empresa de transporte de pasajeros de Río Tercero (Córdoba).

Lo usan Administradores, Encargados, Personal de Taller y Choferes para coordinar la flota, controlar los vencimientos de la documentación reglamentaria, gestionar reservas y despacho de viajes y registrar lecturas de odómetro.

Proyecto académico: UTN FRC, Ingeniería en Sistemas de Información, Seminario Integrador 3K1, Grupo 6.

## Funcionalidades

| Módulo | Qué hace |
| :--- | :--- |
| **Usuarios y sesión** | Login con JWT renovado en cada petición y vencimiento por inactividad según el perfil. Alta, edición y baja de usuarios con perfil `ADMINISTRADOR`, `ENCARGADO`, `PERSONAL_TALLER` o `CHOFER`. |
| **Flota** | Alta, consulta, edición y baja lógica de vehículos (Colectivo, Minibús, Tráfic/Combi, Utilitario). Estados `OPERATIVO`, `EN_TALLER` y `DADO_DE_BAJA`. |
| **Odómetro** | Lecturas de kilometraje (alta, inicio y fin de viaje, manual, corrección, mantenimiento). El kilometraje nunca retrocede y las correcciones quedan vinculadas a la lectura errónea. |
| **Documentación** | Legajo digital de vehículos y choferes (licencia y DNI) con PDFs en Supabase Storage. Vigencia `VIGENTE`, `POR_VENCER` (30 días antes; 5 para el pago del seguro), `VENCIDO` o `PENDIENTE`. Se guardan hasta 3 archivos por tipo de documento y el más antiguo se purga automáticamente. |
| **Viajes especiales** | Los viajes se crean en `A_CONFIRMAR` con choferes y vehículos candidatos y se confirman a `PROGRAMADO` tras validar la disponibilidad. Luego pasan a `EN_VIAJE` y `FINALIZADO`, o a `CANCELADO`. Admiten paradas intermedias, link a Google Maps, aviso al chofer por WhatsApp, cobro al cliente y pago al chofer. |
| **Mis viajes** | Vista del chofer con sus viajes `PROGRAMADO` y `EN_VIAJE`, donde registra el odómetro inicial y final. |
| **Presupuestos** | Presupuestos de viajes con exportación a PDF firmado (ver [backend/README.md](backend/README.md#firmas-de-los-presupuestos)). |
| **Dashboard** | Resumen operativo con viajes del día, viajes por confirmar, próximos viajes y alertas de documentación. |
| **Mantenimiento preventivo** | *Pendiente (SCRUM-34).* Services por kilometraje según el tipo de vehículo y "ficha médica" de cada unidad. |

Las reglas de negocio completas están en [docs/dominio.md](docs/dominio.md).

## Stack

- **Backend:** Node.js 20+, Express 5 (API REST, CommonJS), Prisma ORM 6, Multer, bcrypt y jsonwebtoken.
- **Base de datos:** PostgreSQL alojado en Neon y accedido con Prisma.
- **Archivos:** Supabase Storage con URLs firmadas, usado solo para los PDFs de documentación.
- **Frontend:** React 19 + Vite 8 (SPA, ESM), React Router 7, Axios y `@react-pdf/renderer` / `react-pdf`.
- **Calidad:** test runner nativo de Node (`node --test`) en backend y frontend, y Oxlint en el frontend.
- **Despliegue:** backend en Render, frontend en Vercel.
- **Gestión:** Jira (proyecto `SCRUM`). El código está en GitHub.

## Estructura del repositorio

```
Adri-Mar/
├─ backend/
│  ├─ src/
│  │  ├─ routes/          Endpoints por módulo (/api/...)
│  │  ├─ middlewares/     Autenticación JWT, control de perfiles, carga de archivos
│  │  ├─ controllers/     Manejo de request/response
│  │  ├─ services/        Lógica de negocio, validaciones y acceso a datos
│  │  └─ utils/           Normalización de nombres, ubicaciones y clientes
│  ├─ prisma/
│  │  ├─ schema.prisma    Modelo de datos (PostgreSQL en Neon)
│  │  ├─ migrations/      Migraciones versionadas
│  │  ├─ seed.js          Catálogos y Administrador inicial
│  │  └─ *.js             Scripts de precarga y migración de datos históricos
│  └─ tests/              Tests de integración (node --test)
├─ frontend/
│  └─ src/
│     ├─ pages/           Login, Dashboard, Flota, Usuarios, Viajes, Mis viajes, Documentación, Presupuestos
│     ├─ components/      Componentes de UI reutilizables
│     ├─ constants/       Perfiles, estados y rutas
│     ├─ context/         AuthContext (sesión)
│     ├─ services/        Clientes HTTP (Axios)
│     └─ utils/           Fechas en hora de Córdoba, WhatsApp, paradas, Google Maps
├─ database/diagramas/    Diagramas de entidad-relación
├─ docs/                  Documentación funcional, técnica y design system
├─ CLAUDE.md              Contexto para trabajar con Claude Code
└─ CONTEXTO_SPRINT1.md    Decisiones y criterios del Sprint 1 (histórico)
```

La arquitectura del backend es en capas: **Rutas → Middlewares → Controladores → Servicios → Prisma (Neon) / Supabase Storage**.

## Requisitos

- Node.js 20 o superior y npm.
- Una base PostgreSQL en Neon con dos cadenas de conexión: una con pooler (`DATABASE_URL`) y una directa para las migraciones (`DIRECT_URL`).
- Un bucket de Supabase Storage para los PDFs de documentación.

## Puesta en marcha

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate deploy   # o "npx prisma migrate dev" si vas a crear migraciones
npx prisma db seed          # carga los catálogos y el Administrador inicial
npm run dev
```

El backend queda en `http://localhost:3000`. Para verificarlo: `GET /api/health` → `{ "status": "ok" }`.

Variables de `backend/.env` (ver `.env.example`):

| Variable | Para qué sirve |
| :--- | :--- |
| `PORT` | Puerto de la API (por defecto `3000`). |
| `DATABASE_URL` | Conexión a Neon con pooler (host `-pooler`), la usa la app. |
| `DIRECT_URL` | Conexión directa a Neon, la usa Prisma para migraciones. |
| `JWT_SECRET` | Secreto para firmar los tokens. Usá uno largo y aleatorio. |
| `SESSION_TTL_CHOFER_MIN` | Minutos de inactividad hasta que vence la sesión de un chofer (por defecto `720`). |
| `SESSION_TTL_OTROS_MIN` | Lo mismo para el resto de los perfiles (por defecto `60`). |
| `ADMIN_NOMBRE`, `ADMIN_APELLIDO`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Datos del Administrador inicial que crea el seed. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_NAME` | Acceso a Supabase Storage para los PDFs. |
| `FIRMAS_DIR` *(opcional)* | Carpeta con las firmas de los presupuestos. Por defecto se usa `backend/privado/firmas/`. |

Nunca commitees el `.env` ni las firmas: ambos están en `.gitignore`. Para configurar las firmas de los presupuestos, seguí [backend/README.md](backend/README.md#firmas-de-los-presupuestos).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
npm run dev
```

El frontend queda en `http://localhost:5173`.

## Comandos

| Dónde | Comando | Qué hace |
| :--- | :--- | :--- |
| `backend/` | `npm run dev` | Levanta la API con nodemon. |
| `backend/` | `npm start` | Levanta la API sin recarga (producción). |
| `backend/` | `npm test` | Corre los tests de integración. |
| `backend/` | `npx prisma studio` | Abre el explorador de la base. |
| `frontend/` | `npm run dev` | Levanta Vite en modo desarrollo. |
| `frontend/` | `npm test` | Corre los tests del frontend. |
| `frontend/` | `npm run lint` | Corre Oxlint. |
| `frontend/` | `npm run build` | Genera el build de producción en `dist/`. |

## Flujo de trabajo

- **Ramas:** `main` tiene la versión estable y `develop` es la rama de integración. Cada historia va en una rama `feature/SCRUM-<número>-<descripcion-corta>` creada desde `develop`, por ejemplo `feature/SCRUM-22-registrar-documentacion-vehiculo`.
- **Commits:** Conventional Commits o la clave de Jira, por ejemplo `feat(viajes): paradas intermedias en el recorrido` o `SCRUM-32: agrega endpoint de login`.
- **Pull Requests:** van a `develop` y referencian el ticket de Jira.
- **Definición de terminado:** se cumplen los criterios de aceptación del ticket, las validaciones y los permisos se aplican también en el backend y los tests pasan.

## Documentación

El índice completo está en [docs/README.md](docs/README.md). Lo más consultado:

- [docs/dominio.md](docs/dominio.md): reglas de negocio.
- [docs/INFORMACION_ADICIONAL.md](docs/INFORMACION_ADICIONAL.md): relevamiento operativo de la empresa.
- [docs/handoff-flujo-viajes.md](docs/handoff-flujo-viajes.md): flujo de creación y confirmación de viajes.
- [docs/design-system/README.md](docs/design-system/README.md): design system de la interfaz.
- [CLAUDE.md](CLAUDE.md): contexto y convenciones para trabajar con Claude Code.
