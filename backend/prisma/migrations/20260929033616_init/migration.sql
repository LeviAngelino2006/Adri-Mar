-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMINISTRADOR', 'PERSONAL_TALLER', 'LOGISTICA', 'GERENCIA_GENERAL', 'CHOFER');

-- CreateEnum
CREATE TYPE "EstadoVehiculo" AS ENUM ('OPERATIVO', 'EN_TALLER', 'DADO_DE_BAJA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombre_usuario" TEXT NOT NULL,
    "contrasena_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "dni" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" SERIAL NOT NULL,
    "dominio" TEXT NOT NULL,
    "numero_interno" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "asientos" INTEGER NOT NULL,
    "kilometraje" INTEGER NOT NULL,
    "estado" "EstadoVehiculo" NOT NULL DEFAULT 'OPERATIVO',
    "fecha_baja" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nombre_usuario_key" ON "usuarios"("nombre_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "usuarios"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_dominio_key" ON "vehiculos"("dominio");
