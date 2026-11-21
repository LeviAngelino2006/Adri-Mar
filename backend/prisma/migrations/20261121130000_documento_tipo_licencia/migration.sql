-- Tipo de carnet de la Licencia de Conducir (SCRUM-255): D2 Municipal, D2
-- Provincial o Carnet nacional. Se elige al cargar cada versión de la licencia,
-- así el historial muestra qué carnet tenía el chofer en cada momento. Las
-- licencias que ya existen y los demás tipos de documento quedan en null.

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "tipo_licencia" TEXT;

-- CHECK: solo los tres valores (o null). Que sea obligatorio en la licencia y
-- null en los demás tipos lo valida documentoService.
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tipo_licencia_valido"
  CHECK ("tipo_licencia" IS NULL OR "tipo_licencia" IN ('D2_MUNICIPAL', 'D2_PROVINCIAL', 'CARNET_NACIONAL'));
