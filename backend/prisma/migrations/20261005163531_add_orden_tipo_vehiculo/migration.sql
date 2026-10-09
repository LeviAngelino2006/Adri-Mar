-- Limpieza: "Trafi" (id 3) era un duplicado huérfano del seed, sin vehículos
-- asociados. "Trafic" (id 2) es el valor real, usado por el vehículo AI456JK.
DELETE FROM "tipos_vehiculo" WHERE "descripcion" = 'Trafi';

-- Columna de orden explícito (nullable por ahora, para poder backfillear
-- antes de exigir NOT NULL).
ALTER TABLE "tipos_vehiculo" ADD COLUMN "orden" INTEGER;

-- Backfill de los valores existentes.
UPDATE "tipos_vehiculo" SET "orden" = 1 WHERE "descripcion" = 'Colectivo';
UPDATE "tipos_vehiculo" SET "orden" = 3 WHERE "descripcion" = 'Trafic';

-- Tipos nuevos de esta tarea.
INSERT INTO "tipos_vehiculo" ("descripcion", "orden") VALUES ('Minibus', 2)
  ON CONFLICT ("descripcion") DO UPDATE SET "orden" = 2;
INSERT INTO "tipos_vehiculo" ("descripcion", "orden") VALUES ('Utilitario', 4)
  ON CONFLICT ("descripcion") DO UPDATE SET "orden" = 4;

-- Ahora que todas las filas tienen valor, se puede exigir NOT NULL.
ALTER TABLE "tipos_vehiculo" ALTER COLUMN "orden" SET NOT NULL;
