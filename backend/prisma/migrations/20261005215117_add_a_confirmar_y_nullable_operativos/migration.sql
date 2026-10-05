-- Las columnas operativas pasan a nullable: un viaje A_CONFIRMAR puede no
-- tenerlas todavía. Las FK no se tocan (siguen RESTRICT).
ALTER TABLE "viajes" ALTER COLUMN "chofer_id" DROP NOT NULL,
ALTER COLUMN "vehiculo_id" DROP NOT NULL,
ALTER COLUMN "fecha_inicio" DROP NOT NULL,
ALTER COLUMN "fecha_fin" DROP NOT NULL,
ALTER COLUMN "kilometros_estimados" DROP NOT NULL;

-- Seed: nuevo estado de viaje
INSERT INTO "estado_viaje" ("descripcion") VALUES ('A_CONFIRMAR') ON CONFLICT ("descripcion") DO NOTHING;
