-- Contraseña provisoria (H11 de docs/auditoria-ux/personal-usuarios.md): cuando
-- un gestor crea una cuenta o le cambia la contraseña a otro, la contraseña es
-- provisoria y su dueño la tiene que cambiar al entrar. Las cuentas que ya
-- existen quedan en false: siguen entrando como hasta ahora.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false;
