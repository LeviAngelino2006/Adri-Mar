-- CreateTable
CREATE TABLE "viaje_paradas" (
    "id" SERIAL NOT NULL,
    "viaje_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "viaje_paradas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viaje_paradas_viaje_id_orden_key" ON "viaje_paradas"("viaje_id", "orden");

-- AddForeignKey
ALTER TABLE "viaje_paradas" ADD CONSTRAINT "viaje_paradas_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaje_paradas" ADD CONSTRAINT "viaje_paradas_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
