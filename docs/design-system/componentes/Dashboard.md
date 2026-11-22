Pantalla de inicio. Muestra lo que cada perfil tiene que mirar hoy: el chofer, sus viajes; Personal de Taller, los indicadores de flota y el estado del service; Administrador y Encargado, los indicadores de flota del período, la operación del día, lo que falta confirmar, lo que quedó sin cerrar de días anteriores y las alertas de mantenimiento y documentación. Patrón de página (`Dashboard.jsx`).

## Encabezado
- `h1` "Hola, {nombre}": solo el nombre, sin apellido.
- Sin subtítulo ni línea de fecha.

## Orden de secciones
1. **Lo del chofer** (si `usuario.habilitadoParaConducir`): `ViajeEnCurso` (uno por viaje En viaje) y `ProximosViajes`.
2. **Viajes de hoy** (Administrador y Encargado), a todo el ancho y solo con lo de hoy: ver `ViajesDeHoy`.
3. **`<div class="dashboard-columnas">`** (Administrador y Encargado): dos `<div class="dashboard-columna">` equilibradas, apiladas con gap `space-5`. A la izquierda los pendientes de viaje (`PanelViajesPorConfirmar` y **Sin cerrar**, este último solo si hay alguno, ver `ViajesDeHoy`); a la derecha las alertas de flota (**Mantenimiento** con `PanelMantenimientoDashboard` y **Documentación**). Una columna en mobile y dos iguales desde 1024px, con gap `space-5` y alineadas arriba.
   - **Personal de Taller** ve **Mantenimiento** a todo el ancho (sin Viajes de hoy, Por confirmar ni Documentación).

Un Encargado habilitado para conducir ve la parte de chofer arriba y la operación debajo, en ese orden.

## Paneles
- Cada panel es una `Card` con `.dashboard-panel` (margen inferior `space-6`; dentro de `.dashboard-columnas` o de `.dashboard-columna`, sin margen).
- `.dashboard-panel-header`: el `h2` (17px) a la izquierda y, a la derecha, `.dashboard-resumen` (14px, `color-text-secondary`, números tabulares) con los números del panel en texto gris. Alineados por la línea de base y con wrap.
- Pocos colores: fuera de los `EstadoBadge`, los resúmenes van en texto gris.

## Filas (`.dashboard-lista` y `.dashboard-fila`)
- `<ul class="dashboard-lista">` sin estilos de lista; cada `<li>` con borde superior `color-border`.
- Una fila clickeable es un `<button class="dashboard-fila">` (nunca un `<li role="button">`): grilla de `56px | contenido | auto`, alto mínimo 44px, padding `space-3 space-2`, `radius-sm`, sin borde ni fondo.
  - `.hora-col`: hora en 600, 15px, números tabulares; debajo, en `<small>` (12px, `color-text-secondary`), la segunda hora.
  - `.dashboard-fila-info`: `.dashboard-fila-titulo` (15px, `color-text`) y `.dashboard-fila-meta` (14px, `color-text-secondary`).
  - A la derecha, el `EstadoBadge` sm.
- `.dashboard-fila.sin-hora`: sin la columna de hora (`contenido | auto`), para Documentación y Sin cerrar.
- Hover (solo con mouse, dentro de `@media (hover: hover)`) y `:active` en `brand-50`. Foco: outline 2px `brand-600`, offset 2px.
- Subtítulos de grupo dentro de un panel: `<h3 class="dashboard-grupo-dia">` (13px, 600, mayúsculas, `color-text-secondary`).
- Debajo de 480px: la fila pasa a `48px | contenido` y el badge baja a la segunda columna, alineado a la izquierda; en `.sin-hora`, a una sola columna.

## Mantenimiento
- Encabezado: `h2` "Mantenimiento" y `.dashboard-resumen` con `textoAlertas` ("1 vencido · 2 próximos", se omite si está en cero).
- Lista: un `<button class="dashboard-fila sin-hora">` por vehículo con service `VENCIDO` o `PROXIMO`, ordenado por urgencia (vencidos primero, luego próximos):
  - `.dashboard-fila-titulo`: `{numeroInterno} - {dominio}` (dominio con `.patente`).
  - `.dashboard-fila-meta`: `detalleEstadoService` ("Próximo service a los … km · pasado por … km" / "faltan … km").
  - `EstadoBadge` sm: Vencido (error) o Próximo (warning).
- Tope de 5. Si hay más, `Button` secondary `.dashboard-ver-mas` "Ver N más" / "Ver menos".
- Click: lleva a `/mantenimiento?vehiculoId={id}` (abre su `PanelLateral`).
- Sin alertas: `.dashboard-empty` "Flota al día" con la pista "Ningún vehículo tiene el service vencido ni próximo".

## Documentación
- Encabezado: `h2` "Documentación" y `.dashboard-resumen` "2 vencidos · 3 por vencer" (se omite la parte en cero; singular "1 vencido"). Sin badges en el encabezado.
- Lista: un `<button class="dashboard-fila sin-hora">` por documento vencido o por vencer (`GET /documentos/alertas`):
  - `.dashboard-fila-titulo`: el vehículo ("12 - AE452KD", dominio con `.patente`) o el chofer (nombre y apellido).
  - `.dashboard-fila-meta`: el tipo (`etiquetaTipoDocumento`) y la fecha con las frases de `TarjetaDocumento` en minúscula: "venció el 02 oct, hace 7 días", "vence hoy", "vence el 13 oct, en 4 días" ("hace 1 día", "en 1 día"). El año va solo si no es el año en curso.
  - `EstadoBadge` sm: Vencido (error) o Por vencer (warning).
- Orden: primero los vencidos, del más atrasado al menos atrasado; después los por vencer, del más próximo al más lejano.
- Tope de 5. Si hay más, un `Button` secondary `.dashboard-ver-mas` "Ver N más" / "Ver menos".
- Click: lleva a la ficha en Documentación (`?vehiculoId=` o `?tab=choferes&choferId=`).
- Sin alertas: `.dashboard-empty` "Sin alertas por ahora", sin ícono, con la pista "Toda la documentación registrada de vehículos y choferes está al día". Si falla: `EstadoCarga` con "No pudimos cargar las alertas de documentación. Revisá tu conexión." y "Reintentar" (nunca "Sin alertas", porque no se sabe si las hay).

## Estados vacíos
- Los estados vacíos del Dashboard son solo texto, sin ícono: `.dashboard-empty` con el texto en `color-text-secondary`, centrado, sin SVG. Es igual en todos los paneles: "No hay viajes para hoy", "Nada pendiente para hoy ni mañana", "No tenés viajes pendientes" y "Sin alertas por ahora".
- Si hace falta una pista, va debajo en `.dashboard-empty-hint` (13px, `color-text-secondary`), como en Documentación.

## Reglas
- Fechas y horas en hora de Córdoba (`utils/fechaCordoba.js`, `utils/viajeFormato.js`, `utils/documentacion.js`).
- Textos en español rioplatense, sentence case y sin signos de exclamación.
