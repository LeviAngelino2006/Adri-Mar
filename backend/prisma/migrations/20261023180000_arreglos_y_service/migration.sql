-- Separa el service preventivo de los arreglos (ver docs/plan-ajustes-mantenimiento.md).
-- Escrita a mano: Prisma no migra datos, y la columna "categoria" (texto libre)
-- se convierte al catálogo tipos_arreglo antes de borrarla. La migración
-- anterior (20261023120000_add_mantenimiento) ya está aplicada y no se edita.

-- 1. Catálogo de tipos de arreglo, con sus valores iniciales. Tienen que existir
--    antes de convertir los datos (paso 3). El seed los vuelve a cargar con
--    upsert por nombre, así que no se duplican.
CREATE TABLE "tipos_arreglo" (
    "id_tipoarreglo" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "requiere_detalle" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_arreglo_pkey" PRIMARY KEY ("id_tipoarreglo")
);

CREATE UNIQUE INDEX "tipos_arreglo_nombre_key" ON "tipos_arreglo"("nombre");

INSERT INTO "tipos_arreglo" ("nombre", "descripcion", "requiere_detalle", "orden") VALUES
    ('Engrase', 'Engrase de rodamientos y articulaciones de las ruedas', false, 1),
    ('Rotación de cubiertas', 'Rotación de neumáticos. Se recomienda cada 10.000 km, pero no genera alerta', false, 2),
    ('Cambio de cubiertas', 'Reemplazo de uno o más neumáticos', false, 3),
    ('Frenos', 'Pastillas, discos, cintas o líquido de frenos', false, 4),
    ('Batería y electricidad', 'Batería, alternador, luces y sistema eléctrico', false, 5),
    ('Chapa y pintura', 'Trabajos de chapista', false, 6),
    ('Mecánica general', 'Reparaciones de motor, caja, tren delantero, etc.', false, 7),
    ('Otro', 'Cualquier trabajo que no entra en los anteriores', true, 8);

-- 2. Referencia al tipo de arreglo (null en los services).
ALTER TABLE "mantenimientos_realizados" ADD COLUMN "tipo_arreglo_id" INTEGER;

ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_tipo_arreglo_id_fkey" FOREIGN KEY ("tipo_arreglo_id") REFERENCES "tipos_arreglo"("id_tipoarreglo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Conversión de los registros existentes.
-- 3a. Services: la categoría SERVICE_PREVENTIVO o la marca de preventivo (el
--     código anterior trataba como service cualquiera de las dos).
UPDATE "mantenimientos_realizados"
SET "es_service_preventivo" = true, "tipo_arreglo_id" = NULL
WHERE "es_service_preventivo" = true OR "categoria" = 'SERVICE_PREVENTIVO';

-- 3b. Las categorías viejas que tienen un tipo equivalente.
UPDATE "mantenimientos_realizados" m
SET "tipo_arreglo_id" = t."id_tipoarreglo"
FROM "tipos_arreglo" t
WHERE m."es_service_preventivo" = false
  AND t."nombre" = CASE m."categoria"
    WHEN 'CUBIERTAS' THEN 'Cambio de cubiertas'
    WHEN 'FRENOS' THEN 'Frenos'
    WHEN 'BATERIA' THEN 'Batería y electricidad'
    WHEN 'MECANICA_GENERAL' THEN 'Mecánica general'
  END;

-- 3c. El resto (CAMBIO_ACEITE, FILTROS y ALINEACION_BALANCEO, que ahora son
--     parte del service, y OTRO) pasa a "Otro". "Otro" exige descripción: si
--     estaba vacía, se completa con el nombre de la categoría vieja para no
--     perder qué era.
UPDATE "mantenimientos_realizados"
SET "descripcion" = CASE "categoria"
    WHEN 'CAMBIO_ACEITE' THEN 'Cambio de aceite'
    WHEN 'FILTROS' THEN 'Filtros'
    WHEN 'ALINEACION_BALANCEO' THEN 'Alineación y balanceo'
    WHEN 'OTRO' THEN 'Otro'
    ELSE "categoria"
  END
WHERE "es_service_preventivo" = false
  AND "tipo_arreglo_id" IS NULL
  AND btrim(COALESCE("descripcion", '')) = '';

UPDATE "mantenimientos_realizados"
SET "tipo_arreglo_id" = (SELECT "id_tipoarreglo" FROM "tipos_arreglo" WHERE "nombre" = 'Otro')
WHERE "es_service_preventivo" = false AND "tipo_arreglo_id" IS NULL;

-- 4. La descripción pasa a opcional (el service usa observaciones) y se borra
--    la categoría de texto libre.
ALTER TABLE "mantenimientos_realizados" ALTER COLUMN "descripcion" DROP NOT NULL;
ALTER TABLE "mantenimientos_realizados" DROP COLUMN "categoria";

-- 5. Un registro es un service (sin tipo de arreglo) o un arreglo (con tipo),
--    nunca las dos cosas.
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_service_o_arreglo"
  CHECK (("es_service_preventivo" AND "tipo_arreglo_id" IS NULL) OR (NOT "es_service_preventivo" AND "tipo_arreglo_id" IS NOT NULL));

-- Para el historial de toda la flota, ordenado y filtrado por fecha.
CREATE INDEX "mantenimientos_realizados_fecha_idx" ON "mantenimientos_realizados"("fecha");

-- 6. Aviso al 95 % del intervalo de cada plantilla.
ALTER TABLE "plantillas_mantenimiento" ADD COLUMN "porcentaje_aviso" INTEGER NOT NULL DEFAULT 95;

-- 7. El próximo service y el umbral se calculan (calcularEstadoService), no se guardan.
ALTER TABLE "planes_mantenimiento" DROP COLUMN "km_proximo_service",
DROP COLUMN "umbral_alerta_km";

-- 8. Los vehículos se dan de baja de forma lógica y nunca se borran: Restrict
--    en vez de Cascade, para que un borrado por error no se lleve el historial.
ALTER TABLE "planes_mantenimiento" DROP CONSTRAINT "planes_mantenimiento_vehiculo_id_fkey";
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mantenimientos_realizados" DROP CONSTRAINT "mantenimientos_realizados_vehiculo_id_fkey";
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
