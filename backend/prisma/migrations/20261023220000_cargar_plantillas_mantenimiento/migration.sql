-- Carga las plantillas de service y asigna el plan a los vehículos sin plan.
-- Escrita a mano: es una migración de datos.
--
-- Por qué: las plantillas solo las cargaba el seed. En una base donde no se
-- corrió (producción), 20261023200000_asignar_planes_mantenimiento no creó
-- ningún plan y "Asignar plan" fallaba con "No hay una plantilla de service
-- para el tipo de este vehículo". Mismo patrón que los tipos de arreglo en
-- 20261023180000_arreglos_y_service: la migración los inserta y el seed los
-- vuelve a cargar con upsert, sin duplicar.
--
-- Idempotente: no hace nada donde ya están las plantillas y los planes.

-- 1. Plantillas, mismos valores que PLANTILLAS_MANTENIMIENTO de seed.js. Se
--    buscan por la descripción del tipo: un tipo escrito distinto (por ejemplo
--    "Minibús" con tilde) no recibe plantilla y sus vehículos siguen Sin plan.
--    ON CONFLICT DO NOTHING: si el tipo ya tiene plantilla (o el nombre ya
--    existe), no se toca.
INSERT INTO "plantillas_mantenimiento" ("nombre", "tipo_vehiculo_id", "intervalo_km", "porcentaje_aviso")
SELECT p.nombre, t."id_tipovehiculo", p.intervalo_km, 95
FROM (VALUES
    ('Colectivo', 'Service Colectivo (Cada 20.000 km)', 20000),
    ('Minibus', 'Service Minibús (Cada 20.000 km)', 20000),
    ('Trafic', 'Service Trafic (Cada 15.000 km)', 15000),
    ('Utilitario', 'Service Utilitario (Cada 10.000 km)', 10000)
) AS p(tipo, nombre, intervalo_km)
JOIN "tipos_vehiculo" t ON t."descripcion" = p.tipo
ON CONFLICT DO NOTHING;

-- 2. Planes de los vehículos que todavía no tienen (misma regla que
--    20261023200000: odómetro actual como último service, sin los dados de
--    baja ni los que ya tienen plan).
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
