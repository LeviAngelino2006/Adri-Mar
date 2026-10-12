-- CreateTable
CREATE TABLE "presupuestos" (
    "id" SERIAL NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "origen_id" INTEGER NOT NULL,
    "destino_id" INTEGER NOT NULL,
    "fecha_servicio" DATE NOT NULL,
    "hora_salida" TEXT,
    "cantidad_pasajeros" INTEGER NOT NULL,
    "importe_neto" DECIMAL(12,2) NOT NULL,
    "con_factura" BOOLEAN NOT NULL DEFAULT false,
    "alicuota_iva" DECIMAL(4,2) NOT NULL DEFAULT 10.50,
    "forma_pago" TEXT NOT NULL,
    "dias_validez" INTEGER NOT NULL,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_unidades" (
    "id" SERIAL NOT NULL,
    "presupuesto_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "presupuesto_unidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presupuestos_creado_en_idx" ON "presupuestos"("creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_unidades_presupuesto_id_orden_key" ON "presupuesto_unidades"("presupuesto_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_unidades_presupuesto_id_vehiculo_id_key" ON "presupuesto_unidades"("presupuesto_id", "vehiculo_id");

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_unidades" ADD CONSTRAINT "presupuesto_unidades_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_unidades" ADD CONSTRAINT "presupuesto_unidades_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (Prisma no genera CHECK): las mismas reglas que valida
-- presupuestoService, como garantía dura en la base.
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_cantidad_pasajeros_positiva"
  CHECK ("cantidad_pasajeros" > 0);
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_importe_neto_positivo"
  CHECK ("importe_neto" > 0);
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_dias_validez_rango"
  CHECK ("dias_validez" BETWEEN 1 AND 365);
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_hora_salida_formato"
  CHECK ("hora_salida" IS NULL OR "hora_salida" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
