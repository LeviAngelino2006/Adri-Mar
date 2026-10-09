-- Unifica documentos_vehiculo y documentos_chofer en "documentos" y normaliza
-- el catálogo de tipos (categoria_documento + tipos_documento sin código ni
-- etiqueta). Los datos de documentación existentes son de prueba y se
-- descartan; escrita a mano (no con migrate dev) porque agregar
-- categoria_documento_id NOT NULL sobre una tabla con filas falla.

-- DropTable
DROP TABLE "documentos_vehiculo";

-- DropTable
DROP TABLE "documentos_chofer";

-- DropTable
DROP TABLE "tipos_documento";

-- CreateTable
CREATE TABLE "categoria_documento" (
    "id_categoriadocumento" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "categoria_documento_pkey" PRIMARY KEY ("id_categoriadocumento")
);

-- CreateTable
CREATE TABLE "tipos_documento" (
    "id_tipodocumento" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria_documento_id" INTEGER NOT NULL,
    "requiere_vencimiento" BOOLEAN NOT NULL,
    "requiere_archivo" BOOLEAN NOT NULL,

    CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id_tipodocumento")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" SERIAL NOT NULL,
    "tipo_documento_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER,
    "chofer_id" INTEGER,
    "archivo_path" TEXT,
    "nombre_archivo" TEXT,
    "fecha_emision" TIMESTAMP(3),
    "fecha_vencimiento" TIMESTAMP(3),
    "observaciones" TEXT,
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_documento_descripcion_key" ON "categoria_documento"("descripcion");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_descripcion_key" ON "tipos_documento"("descripcion");

-- CreateIndex
CREATE INDEX "documentos_vehiculo_id_tipo_documento_id_creado_en_idx" ON "documentos"("vehiculo_id", "tipo_documento_id", "creado_en");

-- CreateIndex
CREATE INDEX "documentos_chofer_id_tipo_documento_id_creado_en_idx" ON "documentos"("chofer_id", "tipo_documento_id", "creado_en");

-- AddForeignKey
ALTER TABLE "tipos_documento" ADD CONSTRAINT "tipos_documento_categoria_documento_id_fkey" FOREIGN KEY ("categoria_documento_id") REFERENCES "categoria_documento"("id_categoriadocumento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipos_documento"("id_tipodocumento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un documento pertenece a un vehículo O a un chofer, nunca a los dos ni a ninguno.
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_un_solo_titular"
  CHECK (("vehiculo_id" IS NULL) <> ("chofer_id" IS NULL));

-- Seed categorías de documento iniciales
INSERT INTO "categoria_documento" ("descripcion") VALUES ('VEHICULO'), ('CHOFER');

-- Seed tipos de documento iniciales
INSERT INTO "tipos_documento" ("descripcion", "categoria_documento_id", "requiere_vencimiento", "requiere_archivo") VALUES
  ('POLIZA_SEGURO',         (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), true,  true),
  ('CERT_COBERTURA',        (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), true,  true),
  ('PAGO_SEGURO',           (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), false, true),
  ('ITV',                   (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), true,  true),
  ('MATAFUEGOS',            (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), true,  false),
  ('TITULO_VEHICULO',       (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), false, true),
  ('CEDULA_IDENTIFICACION', (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), false, true),
  ('ALTA_TRANSPORTE',       (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'VEHICULO'), false, true),
  ('LICENCIA_CONDUCIR',     (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'CHOFER'),   true,  true),
  ('DNI_CHOFER',            (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'CHOFER'),   false, true),
  ('EXAMEN_PSICOFISICO',    (SELECT "id_categoriadocumento" FROM "categoria_documento" WHERE "descripcion" = 'CHOFER'),   true,  true);
