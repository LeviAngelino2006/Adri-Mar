-- Días de aviso por tipo de documento: cuántos días antes del vencimiento un
-- documento vigente pasa a "Por vencer". 30 para todos salvo PAGO_SEGURO (5).
-- El DDL salió de `prisma migrate diff` entre el schema anterior y el nuevo;
-- se completó a mano para poder agregar la columna NOT NULL sobre filas
-- existentes (DEFAULT 30 solo durante el ALTER) y para ajustar los datos.

-- AlterTable
ALTER TABLE "tipos_documento" ADD COLUMN "dias_aviso" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "tipos_documento" ALTER COLUMN "dias_aviso" DROP DEFAULT;

-- El pago del seguro pasa a tener vencimiento obligatorio (se carga a mano) y
-- avisa con 5 días.
UPDATE "tipos_documento"
SET "requiere_vencimiento" = true, "dias_aviso" = 5
WHERE "descripcion" = 'PAGO_SEGURO';

-- Se elimina EXAMEN_PSICOFISICO. Sus documentos son datos de prueba.
DELETE FROM "documentos"
WHERE "tipo_documento_id" IN (
  SELECT "id_tipodocumento" FROM "tipos_documento" WHERE "descripcion" = 'EXAMEN_PSICOFISICO'
);

DELETE FROM "tipos_documento" WHERE "descripcion" = 'EXAMEN_PSICOFISICO';
