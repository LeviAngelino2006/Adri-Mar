-- Ubicaciones FRECUENTES y PARTICULARES (es_frecuente) y el Place ID de Google
-- (place_id, único). Solo agrega columnas y relaja el NOT NULL de
-- nombre_normalizado (las particulares van con null): no borra ni renombra nada.

-- AlterTable
ALTER TABLE "ubicaciones" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "es_frecuente" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "place_id" TEXT,
ALTER COLUMN "nombre_normalizado" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_place_id_key" ON "ubicaciones"("place_id");

