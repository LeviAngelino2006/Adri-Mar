-- Coordenadas de cada ubicación para calcular los km estimados sin geocodificar
-- el nombre, y el id de Georef para que la importación de localidades sea
-- idempotente. Solo agrega columnas nullable y un índice único: no toca datos.

-- AlterTable
ALTER TABLE "ubicaciones" ADD COLUMN     "georef_id" TEXT,
ADD COLUMN     "latitud" DOUBLE PRECISION,
ADD COLUMN     "longitud" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_georef_id_key" ON "ubicaciones"("georef_id");

