-- Marca y modelo del vehículo pasan de texto libre a catálogos (marcas,
-- modelos) con el mismo patrón "buscar o crear" que clientes y ubicaciones, y
-- se agrega vehiculos.adquirido_usado. Escrita a mano (no con migrate dev)
-- porque hay que pasar los textos actuales al catálogo antes de borrar las
-- columnas viejas: agregar modelo_id NOT NULL sobre una tabla con filas falla.
--
-- Orden: 1) tablas nuevas y modelo_id nullable; 2) backfill; 3) modelo_id NOT
-- NULL + FK; 4) recién ahí se borran marca y modelo. Todo el archivo corre en
-- una sola transacción implícita (Prisma lo manda como un único script), así
-- que si algún chequeo aborta no queda nada a medias.
--
-- Agrupación: dos textos son la misma marca (o el mismo modelo dentro de una
-- marca) si coinciden con la normalización de src/utils/normalizarNombre.js:
-- trim -> minúsculas -> NFD -> sin marcas combinantes U+0300..U+036F ->
-- espacios colapsados. Abajo está reescrita en SQL (pg_temp.normalizar_nombre),
-- con la misma clase de espacios que \s y trim() de JavaScript (Postgres no
-- tiene una equivalente fija: \s depende del locale). Para cualquier texto
-- cuyo resultado sea ASCII, la versión SQL y la JS dan exactamente lo mismo;
-- si algún resultado tiene un carácter no ASCII (ej. letras griegas o "ø",
-- donde lower() de Postgres y toLowerCase() de JS pueden diferir) la
-- migración aborta en vez de arriesgar un nombreNormalizado distinto del que
-- calcularía buscarOCrear.
--
-- Nombre que se guarda en el catálogo: el del vehículo más antiguo (menor id)
-- del grupo, con trim y sin otros cambios (igual que buscarOCrear, que guarda
-- lo que tipeó el usuario). Un texto vacío o solo espacios pasa a "Sin marca"
-- / "Sin modelo" para no perder el vehículo (la API vieja exigía el campo pero
-- aceptaba un texto de solo espacios).

-- 1) Catálogos ---------------------------------------------------------------

-- CreateTable
CREATE TABLE "marcas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marcas_nombre_idx" ON "marcas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nombre_normalizado_key" ON "marcas"("nombre_normalizado");

-- CreateIndex
CREATE INDEX "modelos_nombre_idx" ON "modelos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_marca_id_nombre_normalizado_key" ON "modelos"("marca_id", "nombre_normalizado");

-- AddForeignKey
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable (modelo_id nullable hasta terminar el backfill)
ALTER TABLE "vehiculos" ADD COLUMN "adquirido_usado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "modelo_id" INTEGER;

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

CREATE TEMP TABLE "vehiculo_catalogo" AS
SELECT
  t."id",
  t."marca_nombre",
  pg_temp.normalizar_nombre(t."marca_nombre") AS "marca_normalizada",
  t."modelo_nombre",
  pg_temp.normalizar_nombre(t."modelo_nombre") AS "modelo_normalizado"
FROM (
  SELECT
    "id",
    COALESCE(NULLIF(pg_temp.recortar("marca"), ''), 'Sin marca') AS "marca_nombre",
    COALESCE(NULLIF(pg_temp.recortar("modelo"), ''), 'Sin modelo') AS "modelo_nombre"
  FROM "vehiculos"
) t;

-- Red de seguridad de la equivalencia con normalizarNombre (ver arriba).
DO $$
DECLARE
  v_problemas TEXT;
BEGIN
  SELECT string_agg(format('vehiculo %s: marca %L, modelo %L', "id", "marca_nombre", "modelo_nombre"), '; ')
  INTO v_problemas
  FROM "vehiculo_catalogo"
  WHERE "marca_normalizada" ~ '[^\x01-\x7f]' OR "modelo_normalizado" ~ '[^\x01-\x7f]';

  IF v_problemas IS NOT NULL THEN
    RAISE EXCEPTION 'Migración abortada: marca/modelo con caracteres que la normalización en SQL no garantiza igual a normalizarNombre(). Corregir a mano y reintentar: %', v_problemas;
  END IF;
END $$;

INSERT INTO "marcas" ("nombre", "nombre_normalizado")
SELECT DISTINCT ON ("marca_normalizada") "marca_nombre", "marca_normalizada"
FROM "vehiculo_catalogo"
ORDER BY "marca_normalizada", "id";

INSERT INTO "modelos" ("nombre", "nombre_normalizado", "marca_id")
SELECT DISTINCT ON (m."id", c."modelo_normalizado") c."modelo_nombre", c."modelo_normalizado", m."id"
FROM "vehiculo_catalogo" c
JOIN "marcas" m ON m."nombre_normalizado" = c."marca_normalizada"
ORDER BY m."id", c."modelo_normalizado", c."id";

UPDATE "vehiculos" v
SET "modelo_id" = mo."id"
FROM "vehiculo_catalogo" c
JOIN "marcas" ma ON ma."nombre_normalizado" = c."marca_normalizada"
JOIN "modelos" mo ON mo."marca_id" = ma."id" AND mo."nombre_normalizado" = c."modelo_normalizado"
WHERE v."id" = c."id";

-- Ningún vehículo puede quedar sin modelo (el SET NOT NULL de abajo también
-- fallaría, pero este mensaje dice cuáles).
DO $$
DECLARE
  v_ids TEXT;
BEGIN
  SELECT string_agg("id"::TEXT, ', ') INTO v_ids FROM "vehiculos" WHERE "modelo_id" IS NULL;
  IF v_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Migración abortada: vehículos sin modelo después del backfill: %', v_ids;
  END IF;
END $$;

DROP TABLE "vehiculo_catalogo";
DROP FUNCTION pg_temp.normalizar_nombre(TEXT);
DROP FUNCTION pg_temp.recortar(TEXT);

-- 3) modelo_id obligatorio ---------------------------------------------------

ALTER TABLE "vehiculos" ALTER COLUMN "modelo_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Columnas viejas ---------------------------------------------------------

-- AlterTable
ALTER TABLE "vehiculos" DROP COLUMN "marca",
DROP COLUMN "modelo";
