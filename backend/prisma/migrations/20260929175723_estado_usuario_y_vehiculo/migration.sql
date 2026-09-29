-- ===== estado_usuario (reemplaza el booleano "activo" de usuarios) =====

-- CreateTable
CREATE TABLE "estado_usuario" (
    "id_estadousuario" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "estado_usuario_pkey" PRIMARY KEY ("id_estadousuario")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_usuario_descripcion_key" ON "estado_usuario"("descripcion");

-- Seed estados de usuario iniciales
INSERT INTO "estado_usuario" ("descripcion") VALUES ('ACTIVO'), ('INACTIVO');

-- AlterTable (columna nullable primero para poder backfillear filas existentes)
ALTER TABLE "usuarios" ADD COLUMN "estado_usuario_id" INTEGER;

-- Backfill: activo = true -> ACTIVO, activo = false -> INACTIVO
UPDATE "usuarios" u
SET "estado_usuario_id" = e."id_estadousuario"
FROM "estado_usuario" e
WHERE e."descripcion" = CASE WHEN u."activo" THEN 'ACTIVO' ELSE 'INACTIVO' END;

-- Ya no quedan nulos: la columna pasa a ser obligatoria
ALTER TABLE "usuarios" ALTER COLUMN "estado_usuario_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_estado_usuario_id_fkey" FOREIGN KEY ("estado_usuario_id") REFERENCES "estado_usuario"("id_estadousuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropColumn (booleano viejo, ya migrado a estado_usuario_id)
ALTER TABLE "usuarios" DROP COLUMN "activo";

-- ===== estado_vehiculo (reemplaza el enum EstadoVehiculo de vehiculos) =====

-- CreateTable
CREATE TABLE "estado_vehiculo" (
    "id_estadovehiculo" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "estado_vehiculo_pkey" PRIMARY KEY ("id_estadovehiculo")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_vehiculo_descripcion_key" ON "estado_vehiculo"("descripcion");

-- Seed estados de vehiculo iniciales
INSERT INTO "estado_vehiculo" ("descripcion") VALUES ('OPERATIVO'), ('EN_TALLER'), ('DADO_DE_BAJA');

-- AlterTable (columna nullable primero para poder backfillear filas existentes)
ALTER TABLE "vehiculos" ADD COLUMN "estado_vehiculo_id" INTEGER;

-- Backfill 1 a 1 por codigo
UPDATE "vehiculos" v
SET "estado_vehiculo_id" = e."id_estadovehiculo"
FROM "estado_vehiculo" e
WHERE e."descripcion" = v."estado"::text;

-- Ya no quedan nulos: la columna pasa a ser obligatoria
ALTER TABLE "vehiculos" ALTER COLUMN "estado_vehiculo_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_estado_vehiculo_id_fkey" FOREIGN KEY ("estado_vehiculo_id") REFERENCES "estado_vehiculo"("id_estadovehiculo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropColumn (enum viejo, ya migrado a estado_vehiculo_id)
ALTER TABLE "vehiculos" DROP COLUMN "estado";

-- DropEnum
DROP TYPE "EstadoVehiculo";
