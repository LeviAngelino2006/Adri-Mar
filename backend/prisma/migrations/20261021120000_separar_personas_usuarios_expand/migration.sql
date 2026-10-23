-- Separación Persona / Usuario — PR 1 (fase EXPAND).
--
-- Persona = quién es alguien en la empresa (datos personales, perfil,
-- habilitación para conducir, legajo de documentación de chofer).
-- Usuario = su cuenta de acceso (nombre de usuario, contraseña, estado).
--
-- Escrita a mano (no con migrate dev): hay backfill de datos entre pasos y
-- cambios de PK / CHECK que migrate dev no sabe ordenar.
--
-- Compatibilidad Expand/Contract: esta migración NO borra ninguna columna ni
-- ninguna FK vieja. Lo que el código nuevo deja de escribir queda NULLABLE (o
-- con default) para que las altas nuevas no fallen:
--   - usuarios: nombre, apellido, perfil_id pasan a NULL-able; dni, email,
--     telefono ya lo eran; habilitado_para_conducir tiene DEFAULT false.
--   - viajes.chofer_id (FK a usuarios) ya era NULL-able: queda como legacy y
--     el chofer pasa a chofer_persona_id (FK a personas).
--   - documentos.chofer_id (FK a usuarios) ya era NULL-able: queda como legacy
--     y el chofer pasa a chofer_persona_id (FK a personas).
--   - viaje_chofer_candidato.usuario_id pasa a NULL-able y la PK pasa a
--     (viaje_id, persona_id).
-- El borrado de todo lo legacy queda para el PR 2 (Contract).
--
-- IDs: cada persona del backfill se crea con el MISMO id que su usuario
-- (personas.id = usuarios.id = usuarios.persona_id para todo lo existente). Así
-- los chofer_id viejos y los nuevos coinciden para los datos históricos y el
-- backfill de las FKs es verificable a simple vista. Después se adelanta la
-- secuencia de personas para que las altas nuevas no choquen.

-- 1. Tabla personas ----------------------------------------------------------

CREATE TABLE "personas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "perfil_id" INTEGER NOT NULL,
    "habilitado_para_conducir" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_baja" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personas_dni_key" ON "personas"("dni");

CREATE UNIQUE INDEX "personas_email_key" ON "personas"("email");

ALTER TABLE "personas" ADD CONSTRAINT "personas_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfiles"("id_perfil") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill: una persona por cada usuario existente ------------------------
-- Un usuario INACTIVO hoy es alguien que ya no está en la empresa: su persona
-- nace dada de baja (activo = false, fecha_baja = momento de la migración, el
-- dato real de cuándo se lo dio de baja no existe).

INSERT INTO "personas" (
    "id", "nombre", "apellido", "dni", "email", "telefono", "perfil_id",
    "habilitado_para_conducir", "activo", "fecha_baja", "creado_en", "actualizado_en"
)
SELECT
    u."id", u."nombre", u."apellido", u."dni", u."email", u."telefono", u."perfil_id",
    u."habilitado_para_conducir",
    (e."descripcion" = 'ACTIVO'),
    CASE WHEN e."descripcion" = 'ACTIVO' THEN NULL ELSE CURRENT_TIMESTAMP END,
    u."creado_en",
    CURRENT_TIMESTAMP
FROM "usuarios" u
JOIN "estado_usuario" e ON e."id_estadousuario" = u."estado_usuario_id";

-- La secuencia arranca después del mayor id copiado (o en 1 si no hay filas).
SELECT setval(
    pg_get_serial_sequence('"personas"', 'id'),
    COALESCE((SELECT MAX("id") FROM "personas"), 0) + 1,
    false
);

-- 3. usuarios.persona_id: NOT NULL, UNIQUE y FK a personas --------------------

ALTER TABLE "usuarios" ADD COLUMN "persona_id" INTEGER;

UPDATE "usuarios" SET "persona_id" = "id";

ALTER TABLE "usuarios" ALTER COLUMN "persona_id" SET NOT NULL;

CREATE UNIQUE INDEX "usuarios_persona_id_key" ON "usuarios"("persona_id");

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Columnas viejas de usuarios: NULL-able (legacy hasta el PR 2) ------------

ALTER TABLE "usuarios" ALTER COLUMN "nombre" DROP NOT NULL,
ALTER COLUMN "apellido" DROP NOT NULL,
ALTER COLUMN "perfil_id" DROP NOT NULL;

-- 5a. viajes: el chofer pasa a ser una persona --------------------------------

ALTER TABLE "viajes" ADD COLUMN "chofer_persona_id" INTEGER;

UPDATE "viajes" v
SET "chofer_persona_id" = u."persona_id"
FROM "usuarios" u
WHERE u."id" = v."chofer_id";

ALTER TABLE "viajes" ADD CONSTRAINT "viajes_chofer_persona_id_fkey" FOREIGN KEY ("chofer_persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Misma restricción de concurrencia que uq_viajes_chofer_en_viaje (migración
-- 20261002203054), ahora sobre la columna nueva: una persona no puede tener
-- dos viajes EN_VIAJE a la vez. El índice viejo sobre chofer_id se conserva
-- (el código nuevo deja chofer_id en NULL y los NULL no chocan).
DO $$
DECLARE
  v_en_viaje_id INTEGER;
BEGIN
  SELECT "id_estadoviaje" INTO v_en_viaje_id FROM "estado_viaje" WHERE "descripcion" = 'EN_VIAJE';

  EXECUTE format(
    'CREATE UNIQUE INDEX "uq_viajes_chofer_persona_en_viaje" ON "viajes"("chofer_persona_id") WHERE "estado_viaje_id" = %s',
    v_en_viaje_id
  );
END $$;

-- 5b. viaje_chofer_candidato: el candidato pasa a ser una persona -------------

ALTER TABLE "viaje_chofer_candidato" ADD COLUMN "persona_id" INTEGER;

UPDATE "viaje_chofer_candidato" c
SET "persona_id" = u."persona_id"
FROM "usuarios" u
WHERE u."id" = c."usuario_id";

ALTER TABLE "viaje_chofer_candidato" ALTER COLUMN "persona_id" SET NOT NULL;

-- La PK pasa de (viaje_id, usuario_id) a (viaje_id, persona_id). Recién sin la
-- PK vieja se puede relajar el NOT NULL de usuario_id (una persona sin cuenta
-- también puede ser candidata).
ALTER TABLE "viaje_chofer_candidato" DROP CONSTRAINT "viaje_chofer_candidato_pkey";

ALTER TABLE "viaje_chofer_candidato" ADD CONSTRAINT "viaje_chofer_candidato_pkey" PRIMARY KEY ("viaje_id", "persona_id");

ALTER TABLE "viaje_chofer_candidato" ALTER COLUMN "usuario_id" DROP NOT NULL;

ALTER TABLE "viaje_chofer_candidato" ADD CONSTRAINT "viaje_chofer_candidato_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5c. documentos: el legajo del chofer pasa a ser de la persona ---------------
-- usuario_id (quién subió el documento) NO cambia: es auditoría y sigue
-- apuntando a usuarios.

ALTER TABLE "documentos" ADD COLUMN "chofer_persona_id" INTEGER;

UPDATE "documentos" d
SET "chofer_persona_id" = u."persona_id"
FROM "usuarios" u
WHERE u."id" = d."chofer_id";

CREATE INDEX "documentos_chofer_persona_id_tipo_documento_id_creado_en_idx" ON "documentos"("chofer_persona_id", "tipo_documento_id", "creado_en");

ALTER TABLE "documentos" ADD CONSTRAINT "documentos_chofer_persona_id_fkey" FOREIGN KEY ("chofer_persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El CHECK de titular único se reescribe sobre la columna nueva: un documento
-- es de un vehículo O de una persona, nunca de los dos ni de ninguno. Con el
-- CHECK viejo (sobre chofer_id) un documento de chofer cargado por el código
-- nuevo (chofer_id NULL) se rechazaría.
ALTER TABLE "documentos" DROP CONSTRAINT "documentos_un_solo_titular";

ALTER TABLE "documentos" ADD CONSTRAINT "documentos_un_solo_titular"
  CHECK (("vehiculo_id" IS NULL) <> ("chofer_persona_id" IS NULL));

-- Mientras exista la columna legacy: si una fila tiene chofer_id viejo, tiene
-- que tener también su persona (combinado con el CHECK de arriba, nunca puede
-- quedar un documento con chofer_id y vehiculo_id a la vez). Se borra en el
-- PR 2 junto con chofer_id.
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_chofer_legacy_con_persona"
  CHECK ("chofer_id" IS NULL OR "chofer_persona_id" IS NOT NULL);
