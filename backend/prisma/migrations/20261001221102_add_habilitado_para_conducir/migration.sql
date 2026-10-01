-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "habilitado_para_conducir" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: los usuarios con perfil Chofer existentes quedan habilitados para conducir
UPDATE "usuarios" u
SET "habilitado_para_conducir" = true
FROM "perfiles" p
WHERE p."id_perfil" = u."perfil_id"
  AND p."descripcion" = 'CHOFER';
