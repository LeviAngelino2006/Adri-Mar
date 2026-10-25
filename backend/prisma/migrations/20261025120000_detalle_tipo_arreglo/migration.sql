-- "Otro" con su propio detalle (ver docs/plan-detalle-otro-y-badge.md): qué se
-- hizo en un tipo con requiere_detalle, que se muestra en lugar del nombre del
-- tipo. Los arreglos con "Otro" ya cargados quedan con detalle NULL y siguen
-- mostrando "Otro" (lo que se hizo está en su descripción).
ALTER TABLE "mantenimiento_tipos_arreglo" ADD COLUMN "detalle" TEXT;
