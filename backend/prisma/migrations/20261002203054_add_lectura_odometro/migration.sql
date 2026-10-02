-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "hora_fin_real" TIMESTAMP(3),
ADD COLUMN     "hora_inicio_real" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "origenes_lectura" (
    "id_origenlectura" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "origenes_lectura_pkey" PRIMARY KEY ("id_origenlectura")
);

-- CreateTable
CREATE TABLE "lecturas_odometro" (
    "id" SERIAL NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "valor_km" INTEGER NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "origen_id" INTEGER NOT NULL,
    "viaje_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "lectura_corregida_id" INTEGER,
    "motivo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lecturas_odometro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "origenes_lectura_descripcion_key" ON "origenes_lectura"("descripcion");

-- CreateIndex
CREATE INDEX "lecturas_odometro_vehiculo_id_fecha_hora_idx" ON "lecturas_odometro"("vehiculo_id", "fecha_hora");

-- AddForeignKey
ALTER TABLE "lecturas_odometro" ADD CONSTRAINT "lecturas_odometro_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_odometro" ADD CONSTRAINT "lecturas_odometro_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "origenes_lectura"("id_origenlectura") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_odometro" ADD CONSTRAINT "lecturas_odometro_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_odometro" ADD CONSTRAINT "lecturas_odometro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_odometro" ADD CONSTRAINT "lecturas_odometro_lectura_corregida_id_fkey" FOREIGN KEY ("lectura_corregida_id") REFERENCES "lecturas_odometro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: nuevo estado de viaje para el flujo Programado -> En viaje -> Finalizado
INSERT INTO "estado_viaje" ("descripcion") VALUES ('EN_VIAJE') ON CONFLICT ("descripcion") DO NOTHING;

-- Restriccion de concurrencia: un vehiculo no puede tener mas de un viaje
-- simultaneo en estado EN_VIAJE, y un chofer tampoco. Se implementa como
-- indice unico parcial. Postgres no permite subconsultas en el predicado de
-- un indice, asi que el id de 'EN_VIAJE' se resuelve en tiempo de migracion
-- y se inyecta como literal via SQL dinamico (EXECUTE), en vez de asumir un
-- id fijo que podria no coincidir segun el historial de la base.
DO $$
DECLARE
  v_en_viaje_id INTEGER;
BEGIN
  SELECT "id_estadoviaje" INTO v_en_viaje_id FROM "estado_viaje" WHERE "descripcion" = 'EN_VIAJE';

  EXECUTE format(
    'CREATE UNIQUE INDEX "uq_viajes_vehiculo_en_viaje" ON "viajes"("vehiculo_id") WHERE "estado_viaje_id" = %s',
    v_en_viaje_id
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX "uq_viajes_chofer_en_viaje" ON "viajes"("chofer_id") WHERE "estado_viaje_id" = %s',
    v_en_viaje_id
  );
END $$;
