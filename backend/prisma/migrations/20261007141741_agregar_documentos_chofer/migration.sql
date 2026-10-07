-- CreateTable
CREATE TABLE "documentos_chofer" (
    "id" SERIAL NOT NULL,
    "chofer_id" INTEGER NOT NULL,
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

    CONSTRAINT "documentos_chofer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_chofer_chofer_id_es_vigente_idx" ON "documentos_chofer"("chofer_id", "es_vigente");

-- CreateIndex
CREATE INDEX "documentos_chofer_tipo_documento_id_idx" ON "documentos_chofer"("tipo_documento_id");

-- AddForeignKey
ALTER TABLE "documentos_chofer" ADD CONSTRAINT "documentos_chofer_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_chofer" ADD CONSTRAINT "documentos_chofer_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipos_documento"("id_tipodocumento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_chofer" ADD CONSTRAINT "documentos_chofer_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
