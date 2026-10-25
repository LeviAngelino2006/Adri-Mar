-- "Quién hizo el trabajo" de un arreglo pasa de texto libre
-- (mantenimientos_realizados.taller_mecanico) a un catálogo "buscar o crear"
-- (responsables_mantenimiento), igual que marcas en
-- 20261014120000_marca_modelo_vehiculo. Escrita a mano: hay que pasar los
-- textos cargados al catálogo antes de borrar la columna vieja. Corre en una
-- sola transacción: si el chequeo aborta, no queda nada a medias.
--
-- Agrupación y normalización: las mismas de esa migración (dos textos son el
-- mismo responsable si coinciden con src/utils/normalizarNombre.js). Nombre que
-- queda en el catálogo: el del registro más antiguo del grupo, con trim. Un
-- texto vacío o solo espacios queda sin responsable (era opcional).

-- 1) Catálogo ----------------------------------------------------------------

-- CreateTable
CREATE TABLE "responsables_mantenimiento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsables_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "responsables_mantenimiento_nombre_idx" ON "responsables_mantenimiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "responsables_mantenimiento_nombre_normalizado_key" ON "responsables_mantenimiento"("nombre_normalizado");

-- AlterTable
ALTER TABLE "mantenimientos_realizados" ADD COLUMN "responsable_id" INTEGER;

-- CreateIndex
CREATE INDEX "mantenimientos_realizados_responsable_id_idx" ON "mantenimientos_realizados"("responsable_id");

-- AddForeignKey
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "responsables_mantenimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Backfill ----------------------------------------------------------------

-- trim() de JavaScript: WhiteSpace + LineTerminator (el mismo conjunto que \s).
CREATE FUNCTION pg_temp.recortar(texto TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    texto,
    '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
    '',
    'g'
  )
$$;

-- normalizarNombre() de src/utils/normalizarNombre.js, paso por paso.
CREATE FUNCTION pg_temp.normalizar_nombre(texto TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(normalize(lower(pg_temp.recortar(texto)), NFD), '[̀-ͯ]', '', 'g'),
    '[\t\n\v\f\r    -     　﻿]+',
    ' ',
    'g'
  )
$$;

CREATE TEMP TABLE "responsable_catalogo" AS
SELECT
  t."id",
  t."nombre",
  pg_temp.normalizar_nombre(t."nombre") AS "nombre_normalizado"
FROM (
  SELECT "id", pg_temp.recortar("taller_mecanico") AS "nombre"
  FROM "mantenimientos_realizados"
  WHERE "taller_mecanico" IS NOT NULL
) t
WHERE t."nombre" <> '';

-- Red de seguridad de la equivalencia con normalizarNombre (ver la migración
-- de marcas).
DO $$
DECLARE
  v_problemas TEXT;
BEGIN
  SELECT string_agg(format('registro %s: responsable %L', "id", "nombre"), '; ')
  INTO v_problemas
  FROM "responsable_catalogo"
  WHERE "nombre_normalizado" ~ '[^\x01-\x7f]';

  IF v_problemas IS NOT NULL THEN
    RAISE EXCEPTION 'Migración abortada: responsables con caracteres que la normalización en SQL no garantiza igual a normalizarNombre(). Corregir a mano y reintentar: %', v_problemas;
  END IF;
END $$;

INSERT INTO "responsables_mantenimiento" ("nombre", "nombre_normalizado")
SELECT DISTINCT ON ("nombre_normalizado") "nombre", "nombre_normalizado"
FROM "responsable_catalogo"
ORDER BY "nombre_normalizado", "id";

UPDATE "mantenimientos_realizados" m
SET "responsable_id" = r."id"
FROM "responsable_catalogo" c
JOIN "responsables_mantenimiento" r ON r."nombre_normalizado" = c."nombre_normalizado"
WHERE m."id" = c."id";

DROP TABLE "responsable_catalogo";
DROP FUNCTION pg_temp.normalizar_nombre(TEXT);
DROP FUNCTION pg_temp.recortar(TEXT);

-- 3) Columna vieja -----------------------------------------------------------

-- AlterTable
ALTER TABLE "mantenimientos_realizados" DROP COLUMN "taller_mecanico";
