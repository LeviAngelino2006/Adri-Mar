-- Un arreglo puede tener varios tipos de trabajo (ver docs/plan-arreglos-varios-tipos.md).
-- Escrita a mano: Prisma no migra datos, y el tipo de cada arreglo existente
-- se pasa a la tabla intermedia antes de borrar la columna.

-- 1. Tabla intermedia registro ↔ tipo de arreglo.
CREATE TABLE "mantenimiento_tipos_arreglo" (
    "mantenimiento_id" INTEGER NOT NULL,
    "tipo_arreglo_id" INTEGER NOT NULL,

    CONSTRAINT "mantenimiento_tipos_arreglo_pkey" PRIMARY KEY ("mantenimiento_id","tipo_arreglo_id")
);

-- Para el filtro del historial por tipo de arreglo.
CREATE INDEX "mantenimiento_tipos_arreglo_tipo_arreglo_id_idx" ON "mantenimiento_tipos_arreglo"("tipo_arreglo_id");

ALTER TABLE "mantenimiento_tipos_arreglo" ADD CONSTRAINT "mantenimiento_tipos_arreglo_mantenimiento_id_fkey" FOREIGN KEY ("mantenimiento_id") REFERENCES "mantenimientos_realizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mantenimiento_tipos_arreglo" ADD CONSTRAINT "mantenimiento_tipos_arreglo_tipo_arreglo_id_fkey" FOREIGN KEY ("tipo_arreglo_id") REFERENCES "tipos_arreglo"("id_tipoarreglo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Cada arreglo existente conserva su único tipo.
INSERT INTO "mantenimiento_tipos_arreglo" ("mantenimiento_id", "tipo_arreglo_id")
SELECT "id", "tipo_arreglo_id" FROM "mantenimientos_realizados"
WHERE "tipo_arreglo_id" IS NOT NULL;

-- 3. El CHECK service/arreglo miraba la columna: un CHECK no puede mirar la
--    tabla intermedia, así que la regla pasa a mantenimientoService. Después
--    se borran la FK y la columna.
ALTER TABLE "mantenimientos_realizados" DROP CONSTRAINT "mantenimientos_service_o_arreglo";
ALTER TABLE "mantenimientos_realizados" DROP CONSTRAINT "mantenimientos_realizados_tipo_arreglo_id_fkey";
ALTER TABLE "mantenimientos_realizados" DROP COLUMN "tipo_arreglo_id";
