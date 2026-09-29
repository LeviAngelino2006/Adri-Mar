-- CreateTable
CREATE TABLE "tipos_vehiculo" (
    "id_tipovehiculo" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "tipos_vehiculo_pkey" PRIMARY KEY ("id_tipovehiculo")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_vehiculo_descripcion_key" ON "tipos_vehiculo"("descripcion");

-- Seed tipos de vehiculo iniciales
INSERT INTO "tipos_vehiculo" ("descripcion") VALUES ('Colectivo'), ('Trafi');

-- AlterTable (columna nullable primero para poder backfillear filas existentes)
ALTER TABLE "vehiculos" ADD COLUMN "tipo_vehiculo_id" INTEGER;

-- Backfill: vehiculos existentes sin tipo quedan como "Colectivo"
UPDATE "vehiculos"
SET "tipo_vehiculo_id" = (SELECT "id_tipovehiculo" FROM "tipos_vehiculo" WHERE "descripcion" = 'Colectivo')
WHERE "tipo_vehiculo_id" IS NULL;

-- Ahora que no quedan nulos, la columna pasa a ser obligatoria
ALTER TABLE "vehiculos" ALTER COLUMN "tipo_vehiculo_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_tipo_vehiculo_id_fkey" FOREIGN KEY ("tipo_vehiculo_id") REFERENCES "tipos_vehiculo"("id_tipovehiculo") ON DELETE RESTRICT ON UPDATE CASCADE;
