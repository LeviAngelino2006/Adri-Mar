-- CreateTable
CREATE TABLE "perfiles" (
    "id_perfil" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id_perfil")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_descripcion_key" ON "perfiles"("descripcion");

-- Seed perfiles iniciales
INSERT INTO "perfiles" ("descripcion") VALUES ('ADMINISTRADOR'), ('ENCARGADO'), ('PERSONAL_TALLER'), ('CHOFER');

-- AlterTable (columna nullable primero para poder backfillear filas existentes)
ALTER TABLE "usuarios" ADD COLUMN "perfil_id" INTEGER;

-- Backfill: mapea el enum viejo al nuevo perfil.
-- LOGISTICA y GERENCIA_GENERAL se unifican en ENCARGADO; el resto conserva su codigo.
UPDATE "usuarios" u
SET "perfil_id" = p."id_perfil"
FROM "perfiles" p
WHERE p."descripcion" = CASE u."perfil"::text
  WHEN 'LOGISTICA' THEN 'ENCARGADO'
  WHEN 'GERENCIA_GENERAL' THEN 'ENCARGADO'
  ELSE u."perfil"::text
END;

-- Ya no quedan nulos: la columna pasa a ser obligatoria
ALTER TABLE "usuarios" ALTER COLUMN "perfil_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfiles"("id_perfil") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropColumn (enum viejo, ya migrado a perfil_id)
ALTER TABLE "usuarios" DROP COLUMN "perfil";

-- DropEnum
DROP TYPE "Perfil";
