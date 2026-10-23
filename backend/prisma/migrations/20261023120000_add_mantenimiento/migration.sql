-- CreateTable
CREATE TABLE "plantillas_mantenimiento" (
    "id_plantillamantenimiento" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_vehiculo_id" INTEGER NOT NULL,
    "intervalo_km" INTEGER NOT NULL,

    CONSTRAINT "plantillas_mantenimiento_pkey" PRIMARY KEY ("id_plantillamantenimiento")
);

-- CreateTable
CREATE TABLE "planes_mantenimiento" (
    "id" SERIAL NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "plantilla_mantenimiento_id" INTEGER NOT NULL,
    "km_ultimo_service" INTEGER NOT NULL,
    "km_proximo_service" INTEGER NOT NULL,
    "umbral_alerta_km" INTEGER NOT NULL DEFAULT 1000,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantenimientos_realizados" (
    "id" SERIAL NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "plan_mantenimiento_id" INTEGER,
    "es_service_preventivo" BOOLEAN NOT NULL DEFAULT false,
    "categoria" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "kilometraje" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "repuestos" TEXT,
    "taller_mecanico" TEXT,
    "costo" DECIMAL(12,2),
    "observaciones" TEXT,
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mantenimientos_realizados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_mantenimiento_nombre_key" ON "plantillas_mantenimiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_mantenimiento_tipo_vehiculo_id_key" ON "plantillas_mantenimiento"("tipo_vehiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "planes_mantenimiento_vehiculo_id_key" ON "planes_mantenimiento"("vehiculo_id");

-- CreateIndex
CREATE INDEX "mantenimientos_realizados_vehiculo_id_fecha_idx" ON "mantenimientos_realizados"("vehiculo_id", "fecha");

-- AddForeignKey
ALTER TABLE "plantillas_mantenimiento" ADD CONSTRAINT "plantillas_mantenimiento_tipo_vehiculo_id_fkey" FOREIGN KEY ("tipo_vehiculo_id") REFERENCES "tipos_vehiculo"("id_tipovehiculo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_plantilla_mantenimiento_id_fkey" FOREIGN KEY ("plantilla_mantenimiento_id") REFERENCES "plantillas_mantenimiento"("id_plantillamantenimiento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_plan_mantenimiento_id_fkey" FOREIGN KEY ("plan_mantenimiento_id") REFERENCES "planes_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_realizados" ADD CONSTRAINT "mantenimientos_realizados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
