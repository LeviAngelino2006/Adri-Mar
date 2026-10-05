-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "nombre_normalizado" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ubicaciones" ADD COLUMN     "nombre_normalizado" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nombre_normalizado_key" ON "clientes"("nombre_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_nombre_normalizado_key" ON "ubicaciones"("nombre_normalizado");
