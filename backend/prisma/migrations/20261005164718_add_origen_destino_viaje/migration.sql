-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "destino_id" INTEGER,
ADD COLUMN     "origen_id" INTEGER;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
