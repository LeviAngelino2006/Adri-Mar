-- Separación Persona / Usuario — PR 2 (fase CONTRACT).
--
-- Borra todo lo que la fase Expand (20261021120000) dejó como legacy. El código
-- ya no lee ni escribe ninguna de estas columnas:
--   - usuarios: nombre, apellido, dni, email, telefono, perfil_id y
--     habilitado_para_conducir (viven en personas), con la FK a perfiles y los
--     únicos de dni y email.
--   - viajes.chofer_id (FK a usuarios) y su índice de concurrencia
--     uq_viajes_chofer_en_viaje: el chofer es chofer_persona_id.
--   - documentos.chofer_id (FK a usuarios), su índice y el CHECK
--     documentos_chofer_legacy_con_persona: el titular es chofer_persona_id.
--   - viaje_chofer_candidato.usuario_id (FK a usuarios): el candidato es
--     persona_id.
--
-- Escrita a mano (no con migrate dev) por el chequeo del paso 1.

-- 1. Chequeo previo -----------------------------------------------------------
-- Si alguna fila tiene el dato SOLO en la columna legacy, borrarla lo perdería.
-- En ese caso se aborta acá, antes de tocar nada: la migración corre en una sola
-- transacción, así que la base queda como estaba. Hay que completar la columna
-- nueva, marcar la migración como revertida
-- (prisma migrate resolve --rolled-back 20261024120000_separar_personas_usuarios_contract)
-- y volver a desplegar.
--
-- No se compara que chofer_id y chofer_persona_id apunten a la misma persona:
-- desde la fase Expand el código cambia solo chofer_persona_id (al reasignar el
-- chofer), así que una diferencia es esperable y la columna nueva es la buena.
-- usuarios.persona_id y viaje_chofer_candidato.persona_id ya son NOT NULL desde
-- la fase Expand; se chequean igual por si alguien tocó la base a mano.
DO $$
DECLARE
  v_viajes     INTEGER;
  v_documentos INTEGER;
  v_candidatos INTEGER;
  v_usuarios   INTEGER;
  v_detalle    TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT COUNT(*) INTO v_viajes
  FROM "viajes" WHERE "chofer_id" IS NOT NULL AND "chofer_persona_id" IS NULL;

  SELECT COUNT(*) INTO v_documentos
  FROM "documentos" WHERE "chofer_id" IS NOT NULL AND "chofer_persona_id" IS NULL;

  SELECT COUNT(*) INTO v_candidatos
  FROM "viaje_chofer_candidato" WHERE "usuario_id" IS NOT NULL AND "persona_id" IS NULL;

  SELECT COUNT(*) INTO v_usuarios
  FROM "usuarios" WHERE "persona_id" IS NULL;

  IF v_viajes > 0 THEN
    v_detalle := v_detalle || format('viajes: %s fila(s) con chofer_id y sin chofer_persona_id', v_viajes);
  END IF;
  IF v_documentos > 0 THEN
    v_detalle := v_detalle || format('documentos: %s fila(s) con chofer_id y sin chofer_persona_id', v_documentos);
  END IF;
  IF v_candidatos > 0 THEN
    v_detalle := v_detalle || format('viaje_chofer_candidato: %s fila(s) con usuario_id y sin persona_id', v_candidatos);
  END IF;
  IF v_usuarios > 0 THEN
    v_detalle := v_detalle || format('usuarios: %s fila(s) sin persona_id', v_usuarios);
  END IF;

  IF array_length(v_detalle, 1) > 0 THEN
    RAISE EXCEPTION 'Contract personas/usuarios abortada: se perderían datos al borrar las columnas legacy. %. Completá la columna nueva antes de volver a correr la migración.',
      array_to_string(v_detalle, '; ');
  END IF;
END $$;

-- 2. viajes -------------------------------------------------------------------

DROP INDEX "uq_viajes_chofer_en_viaje";

ALTER TABLE "viajes" DROP CONSTRAINT "viajes_chofer_id_fkey";

ALTER TABLE "viajes" DROP COLUMN "chofer_id";

-- 3. documentos ---------------------------------------------------------------

ALTER TABLE "documentos" DROP CONSTRAINT "documentos_chofer_legacy_con_persona";

ALTER TABLE "documentos" DROP CONSTRAINT "documentos_chofer_id_fkey";

DROP INDEX "documentos_chofer_id_tipo_documento_id_creado_en_idx";

ALTER TABLE "documentos" DROP COLUMN "chofer_id";

-- 4. viaje_chofer_candidato ---------------------------------------------------

ALTER TABLE "viaje_chofer_candidato" DROP CONSTRAINT "viaje_chofer_candidato_usuario_id_fkey";

ALTER TABLE "viaje_chofer_candidato" DROP COLUMN "usuario_id";

-- 5. usuarios -----------------------------------------------------------------

ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_perfil_id_fkey";

DROP INDEX "usuarios_dni_key";

DROP INDEX "usuarios_email_key";

ALTER TABLE "usuarios" DROP COLUMN "nombre",
DROP COLUMN "apellido",
DROP COLUMN "dni",
DROP COLUMN "email",
DROP COLUMN "telefono",
DROP COLUMN "perfil_id",
DROP COLUMN "habilitado_para_conducir";
