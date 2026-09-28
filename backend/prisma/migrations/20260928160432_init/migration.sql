-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `nombre_usuario` VARCHAR(191) NOT NULL,
    `contrasena_hash` VARCHAR(191) NOT NULL,
    `perfil` ENUM('ADMINISTRADOR', 'PERSONAL_TALLER', 'LOGISTICA', 'GERENCIA_GENERAL', 'CHOFER') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `usuarios_nombre_usuario_key`(`nombre_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehiculos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dominio` VARCHAR(191) NOT NULL,
    `numero_interno` VARCHAR(191) NOT NULL,
    `marca` VARCHAR(191) NOT NULL,
    `modelo` VARCHAR(191) NOT NULL,
    `anio` INTEGER NOT NULL,
    `asientos` INTEGER NOT NULL,
    `kilometraje` INTEGER NOT NULL,
    `estado` ENUM('OPERATIVO', 'EN_TALLER', 'DADO_DE_BAJA') NOT NULL DEFAULT 'OPERATIVO',
    `fecha_baja` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `vehiculos_dominio_key`(`dominio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
