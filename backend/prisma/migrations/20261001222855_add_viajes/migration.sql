-- CreateTable
CREATE TABLE "estado_viaje" (
    "id_estadoviaje" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "estado_viaje_pkey" PRIMARY KEY ("id_estadoviaje")
);

-- CreateTable
CREATE TABLE "viajes" (
    "id" SERIAL NOT NULL,
    "chofer_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "kilometros_estimados" INTEGER NOT NULL,
    "estado_viaje_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viajes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_viaje_descripcion_key" ON "estado_viaje"("descripcion");

-- Seed estados de viaje iniciales
INSERT INTO "estado_viaje" ("descripcion") VALUES ('PROGRAMADO'), ('FINALIZADO'), ('CANCELADO');

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_estado_viaje_id_fkey" FOREIGN KEY ("estado_viaje_id") REFERENCES "estado_viaje"("id_estadoviaje") ON DELETE RESTRICT ON UPDATE CASCADE;
