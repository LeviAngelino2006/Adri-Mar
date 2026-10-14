-- El DNI del chofer pasa a tener fecha de vencimiento (aviso de 30 días, el
-- dias_aviso que ya tiene). Los documentos DNI_CHOFER cargados hasta ahora son
-- de prueba y no tienen vencimiento, así que se descartan. Escrita a mano: no
-- cambia el schema, solo datos.
--
-- Cada versión de un documento es una fila de "documentos" (no hay tabla de
-- historial aparte) y ninguna tabla referencia a "documentos", así que alcanza
-- con borrar esas filas. El tipo se conserva: lo referencian las filas
-- borradas, no al revés.
--
-- Los PDFs de esos documentos quedan en el Storage de Supabase; esta migración
-- no los borra. Para listarlos ANTES de aplicarla:
--   SELECT d."archivo_path" FROM "documentos" d
--   JOIN "tipos_documento" t ON t."id_tipodocumento" = d."tipo_documento_id"
--   WHERE t."descripcion" = 'DNI_CHOFER' AND d."archivo_path" IS NOT NULL;

DELETE FROM "documentos"
WHERE "tipo_documento_id" IN (
  SELECT "id_tipodocumento" FROM "tipos_documento" WHERE "descripcion" = 'DNI_CHOFER'
);

UPDATE "tipos_documento"
SET "requiere_vencimiento" = true
WHERE "descripcion" = 'DNI_CHOFER';
