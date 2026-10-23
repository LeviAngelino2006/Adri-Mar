Los tres estados de algo que se carga (un listado o un panel): cargando, error y vacío. Un error al cargar nunca se muestra como "no hay datos". Componente de la app (`components/ui/EstadoCarga.jsx`) con el hook `useCarga` (`hooks/useCarga.js`).

## Cuándo usarlo
- En todo listado o panel que pide datos al entrar: Viajes, Flota de vehículos, Mis viajes, "Tus viajes pendientes" del Dashboard y los paneles de gestión del Dashboard (Viajes de hoy, Viajes por confirmar y Documentación).
- Para las opciones de un `select` dentro de un formulario no: si no cargan, el mensaje (el mismo `mensajeErrorCarga`, con "la lista de choferes") va como `error` de su `FormField` y el resto del formulario sigue usable.
- Para una acción (guardar, cancelar) no: ahí el error va en el formulario o el modal.

## Lo que provee quien lo usa
- `carga`: lo que devuelve `useCarga(pedir)`, `{ datos, cargando, error, recargar }`. `pedir` es una función memorizada con `useCallback` que devuelve una promesa con los datos; cuando cambia (por ejemplo, con los filtros) se vuelve a pedir.
- `forma` y `cantidad`: las de `Cargando`.
- `que`: qué se carga, con artículo ("los viajes", "los vehículos", "tus viajes"). Arma el mensaje de error.
- `vacio`: el estado vacío de la pantalla, solo cuando de verdad no hay datos (`lista.length === 0 && <div className="listado-vacio">…</div>`).
- `children`: el contenido con datos.

## Orden y textos
1. Cargando: `Cargando` con su `forma`.
2. Error: `Alert` error con el mensaje y un `Button` secondary "Reintentar", que vuelve a pedir:
   - sin respuesta del servidor (sin red o backend caído): "No pudimos cargar {que}. Revisá tu conexión.";
   - con respuesta de error: "No pudimos cargar {que}. Intentá de nuevo en unos minutos.".
3. Vacío: lo que venga en `vacio`.
4. Con datos: los `children`.

## Reglas
- El mensaje y "Reintentar" van en la misma línea; si no entran, el botón baja. Debajo de 480px ocupa todo el ancho.
- Mientras se reintenta vuelve el estado de carga; si falla otra vez, vuelve el error.
