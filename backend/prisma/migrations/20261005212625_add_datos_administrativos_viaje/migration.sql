-- CreateTable
CREATE TABLE "estado_pago" (
    "id_estadopago" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "estado_pago_pkey" PRIMARY KEY ("id_estadopago")
);

-- CreateTable
CREATE TABLE "metodo_pago" (
    "id_metodopago" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "metodo_pago_pkey" PRIMARY KEY ("id_metodopago")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_pago_descripcion_key" ON "estado_pago"("descripcion");

-- CreateIndex
CREATE UNIQUE INDEX "metodo_pago_descripcion_key" ON "metodo_pago"("descripcion");

-- Seed: catálogos de pago
INSERT INTO "estado_pago" ("descripcion") VALUES ('PENDIENTE'), ('PAGADO'), ('PARCIAL');
INSERT INTO "metodo_pago" ("descripcion") VALUES ('EFECTIVO'), ('BANCO'), ('CHEQUE');

-- AlterTable
ALTER TABLE "viajes" ADD COLUMN     "cliente_id" INTEGER,
ADD COLUMN     "estado_pago_chofer_id" INTEGER,
ADD COLUMN     "estado_pago_cliente_id" INTEGER,
ADD COLUMN     "fecha_pago_chofer" TIMESTAMP(3),
ADD COLUMN     "fecha_pago_cliente" TIMESTAMP(3),
ADD COLUMN     "metodo_pago_chofer_id" INTEGER,
ADD COLUMN     "metodo_pago_cliente_id" INTEGER,
ADD COLUMN     "pago_chofer" DECIMAL(12,2),
ADD COLUMN     "precio" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_estado_pago_cliente_id_fkey" FOREIGN KEY ("estado_pago_cliente_id") REFERENCES "estado_pago"("id_estadopago") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_metodo_pago_cliente_id_fkey" FOREIGN KEY ("metodo_pago_cliente_id") REFERENCES "metodo_pago"("id_metodopago") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_estado_pago_chofer_id_fkey" FOREIGN KEY ("estado_pago_chofer_id") REFERENCES "estado_pago"("id_estadopago") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_metodo_pago_chofer_id_fkey" FOREIGN KEY ("metodo_pago_chofer_id") REFERENCES "metodo_pago"("id_metodopago") ON DELETE SET NULL ON UPDATE CASCADE;
