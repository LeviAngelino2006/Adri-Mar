-- El perfil Chofer implica estar habilitado para conducir (H17 de
-- docs/auditoria-ux/personal-usuarios.md, decisión del cliente). Desde este
-- cambio, personaService lo fuerza en el alta y en la edición; esto habilita a
-- las personas con perfil Chofer que se cargaron antes sin habilitar.
-- Escrita a mano: es una migración de datos, Prisma no la genera.
--
-- Efecto: esas personas, si están activas, empiezan a aparecer entre los
-- choferes para asignar a un viaje y ven "Mis viajes". En Documentación ›
-- Choferes ya aparecían (el listado era "perfil Chofer o habilitado").
--
-- Incluye a las dadas de baja: si se las reactiva, vuelven con la misma regla.
-- No toca a los demás perfiles: un Encargado que no maneja sigue sin habilitar.
-- En una base nueva no hay personas: no actualiza nada.

UPDATE "personas" AS p
SET "habilitado_para_conducir" = true,
    "actualizado_en" = CURRENT_TIMESTAMP
FROM "perfiles" AS f
WHERE f."id_perfil" = p."perfil_id"
  AND f."descripcion" = 'CHOFER'
  AND p."habilitado_para_conducir" = false;
