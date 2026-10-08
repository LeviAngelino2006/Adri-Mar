-- CreateTable
CREATE TABLE "viaje_chofer_candidato" (
    "viaje_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "viaje_chofer_candidato_pkey" PRIMARY KEY ("viaje_id","usuario_id")
);

-- CreateTable
CREATE TABLE "viaje_vehiculo_candidato" (
    "viaje_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,

    CONSTRAINT "viaje_vehiculo_candidato_pkey" PRIMARY KEY ("viaje_id","vehiculo_id")
);

-- AddForeignKey
ALTER TABLE "viaje_chofer_candidato" ADD CONSTRAINT "viaje_chofer_candidato_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaje_chofer_candidato" ADD CONSTRAINT "viaje_chofer_candidato_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaje_vehiculo_candidato" ADD CONSTRAINT "viaje_vehiculo_candidato_viaje_id_fkey" FOREIGN KEY ("viaje_id") REFERENCES "viajes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaje_vehiculo_candidato" ADD CONSTRAINT "viaje_vehiculo_candidato_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migración de datos: los viajes A_CONFIRMAR que ya tenían chofer y/o vehículo
-- pasan a tenerlos como candidatos, y el asignado queda en NULL (en
-- A_CONFIRMAR el asignado se completa recién al confirmar). Los viajes en
-- cualquier otro estado no se tocan.
INSERT INTO "viaje_chofer_candidato" ("viaje_id", "usuario_id")
SELECT v."id", v."chofer_id"
FROM "viajes" v
JOIN "estado_viaje" e ON e."id_estadoviaje" = v."estado_viaje_id"
WHERE e."descripcion" = 'A_CONFIRMAR' AND v."chofer_id" IS NOT NULL;

INSERT INTO "viaje_vehiculo_candidato" ("viaje_id", "vehiculo_id")
SELECT v."id", v."vehiculo_id"
FROM "viajes" v
JOIN "estado_viaje" e ON e."id_estadoviaje" = v."estado_viaje_id"
WHERE e."descripcion" = 'A_CONFIRMAR' AND v."vehiculo_id" IS NOT NULL;

UPDATE "viajes"
SET "chofer_id" = NULL, "vehiculo_id" = NULL
WHERE "estado_viaje_id" = (SELECT "id_estadoviaje" FROM "estado_viaje" WHERE "descripcion" = 'A_CONFIRMAR');
