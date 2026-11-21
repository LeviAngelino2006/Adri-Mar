-- Último ingreso de cada cuenta (SCRUM-257): la ficha de usuario muestra cuándo
-- fue el último login exitoso. Se registra desde esta migración: las cuentas que
-- ya existen quedan en null ("Sin registro") hasta su próximo ingreso.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ultimo_ingreso" TIMESTAMP(3);
