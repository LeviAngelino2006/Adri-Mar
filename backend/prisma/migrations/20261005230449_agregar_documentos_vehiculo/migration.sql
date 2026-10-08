-- CreateTable
CREATE TABLE "tipos_documento" (
    "id_tipodocumento" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "aplica_a" TEXT NOT NULL,
    "requiere_vencimiento" BOOLEAN NOT NULL DEFAULT true,
    "requiere_archivo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id_tipodocumento")
);

-- CreateTable
CREATE TABLE "documentos_vehiculo" (
    "id" SERIAL NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "tipo_documento_id" INTEGER NOT NULL,
    "archivo_url" TEXT,
    "archivo_path" TEXT,
    "nombre_original" TEXT,
    "fecha_emision" TIMESTAMP(3),
    "fecha_vencimiento" TIMESTAMP(3),
    "observaciones" TEXT,
    "es_vigente" BOOLEAN NOT NULL DEFAULT true,
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_codigo_key" ON "tipos_documento"("codigo");

-- CreateIndex
CREATE INDEX "documentos_vehiculo_vehiculo_id_es_vigente_idx" ON "documentos_vehiculo"("vehiculo_id", "es_vigente");

-- CreateIndex
CREATE INDEX "documentos_vehiculo_tipo_documento_id_idx" ON "documentos_vehiculo"("tipo_documento_id");

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipos_documento"("id_tipodocumento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_vehiculo" ADD CONSTRAINT "documentos_vehiculo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
