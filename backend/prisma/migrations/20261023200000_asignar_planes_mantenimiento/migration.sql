-- Asigna el plan de service a los vehículos que ya existían sin plan.
-- Escrita a mano: es una migración de datos, Prisma no la genera. Desde ahora
-- el alta de un vehículo crea su plan (vehiculoService.crearVehiculo), así que
-- esto solo completa los vehículos cargados antes de ese cambio.
--
-- Km del último service: el odómetro actual. Los vehículos cargados hasta hoy
-- son de prueba; si alguno tuviera un service real distinto, se corrige desde
-- el modal "Asignar plan" de Mantenimiento.
--
-- Se saltean:
--   - los dados de baja (no reciben alertas ni registros);
--   - los que ya tienen plan (UNIQUE vehiculo_id), activo o no;
--   - los de un tipo sin plantilla (quedan SIN_PLAN).
-- Las plantillas las carga el seed: en una base nueva (migrate antes del seed)
-- esto no inserta nada, y no hace falta porque tampoco hay vehículos.

INSERT INTO "planes_mantenimiento"
    ("vehiculo_id", "plantilla_mantenimiento_id", "km_ultimo_service", "activo", "actualizado_en")
SELECT v."id", p."id_plantillamantenimiento", v."kilometraje", true, CURRENT_TIMESTAMP
FROM "vehiculos" v
JOIN "plantillas_mantenimiento" p ON p."tipo_vehiculo_id" = v."tipo_vehiculo_id"
JOIN "estado_vehiculo" e ON e."id_estadovehiculo" = v."estado_vehiculo_id"
WHERE e."descripcion" <> 'DADO_DE_BAJA'
  AND NOT EXISTS (
    SELECT 1 FROM "planes_mantenimiento" pm WHERE pm."vehiculo_id" = v."id"
  );
