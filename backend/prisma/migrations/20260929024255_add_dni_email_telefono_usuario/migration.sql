-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `dni` VARCHAR(191) NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `telefono` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `usuarios_dni_key` ON `usuarios`(`dni`);

-- CreateIndex
CREATE UNIQUE INDEX `usuarios_email_key` ON `usuarios`(`email`);
