# Adri-Mar Gestión

Sistema de gestión y documentación de mantenimiento de vehículos para Adri-mar, empresa de transporte de pasajeros de Río Tercero (Córdoba).

Proyecto académico (UTN FRC, Seminario Integrador 3K1, Grupo 6).

## Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express (API REST)
- **Base de datos:** MySQL, accedida con [Prisma](https://www.prisma.io/) (ORM)
- **Gestión:** Jira (proyecto SCRUM). Código en GitHub.

Ver [CONTEXTO_SPRINT1.md](./CONTEXTO_SPRINT1.md) para el detalle de decisiones técnicas, modelo de datos y criterios de aceptación del Sprint 1.

## Estructura del repositorio

```
Adri-Mar/
├─ frontend/                 (React)
├─ backend/
│  ├─ src/
│  │  ├─ controllers/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ middlewares/
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed.js             (Administrador inicial)
│  └─ tests/
├─ database/
│  └─ diagramas/
└─ docs/
```

## Requisitos

- Node.js 20+
- MySQL 8 (o Docker, para levantarlo local)

## Puesta en marcha

### 1. Base de datos

Con Docker:

```bash
docker run --name adrimar-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=adrimar_gestion \
  -e MYSQL_USER=adrimar \
  -e MYSQL_PASSWORD=adrimar_pass \
  -p 3306:3306 -d mysql:8
```

El usuario de la base debe poder crear bases de datos temporales (shadow database) para que `prisma migrate dev` funcione en desarrollo.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # completar DATABASE_URL, JWT_SECRET y credenciales del admin inicial
npx prisma migrate dev
npx prisma db seed     # crea el Administrador inicial (usuario/contraseña desde .env)
npm run dev
```

El backend queda disponible en `http://localhost:3000` (`GET /api/health` para verificar).

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # completar VITE_API_URL si el backend no corre en localhost:3000
npm run dev
```

## Ramas y commits

- `main`: versión estable.
- `develop`: integración.
- `feature/US-<número>-<descripción-corta>`: una rama por User Story, creada desde `develop`.
- Cada commit y cada Pull Request menciona la clave de Jira correspondiente (ej. `SCRUM-32: agrega endpoint de login`).
