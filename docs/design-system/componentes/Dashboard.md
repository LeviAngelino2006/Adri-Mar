Pantalla de inicio. Muestra lo que cada perfil tiene que mirar hoy: el chofer, sus viajes; Administrador y Encargado, la operación del día, lo que falta confirmar y la documentación por vencer. Patrón de página (`Dashboard.jsx`).

## Encabezado
- `h1` "Hola, {nombre}": solo el nombre, sin apellido.
- Sin subtítulo ni línea de fecha.

## Orden de secciones
1. **Lo del chofer** (si `usuario.habilitadoParaConducir`): `ViajeEnCurso` (uno por viaje En viaje) y `ProximosViajes`.
2. **Viajes de hoy** (Administrador y Encargado), a todo el ancho: ver `ViajesDeHoy`.
3. **`<div class="dashboard-columnas">`** (Administrador y Encargado): a la izquierda `PanelViajesPorConfirmar` y a la derecha Documentación. Una columna en mobile y dos iguales desde 1024px, con gap `space-6` y alineadas arriba.

Un Encargado habilitado para conducir ve las tres partes, en ese orden.

## Paneles
- Cada panel es una `Card` con `.dashboard-panel` (margen inferior `space-6`; dentro de `.dashboard-columnas`, sin margen).
- `.dashboard-panel-header`: el `h2` (17px) a la izquierda y, a la derecha, `.dashboard-resumen` (14px, `color-text-secondary`, números tabulares) con los números del panel en texto gris. Alineados por la línea de base y con wrap.
- Pocos colores: fuera de los `EstadoBadge`, los resúmenes van en texto gris.

## Filas (`.dashboard-lista` y `.dashboard-fila`)
- `<ul class="dashboard-lista">` sin estilos de lista; cada `<li>` con borde superior `color-border`.
- Una fila clickeable es un `<button class="dashboard-fila">` (nunca un `<li role="button">`): grilla de `56px | contenido | auto`, alto mínimo 44px, padding `space-3 space-2`, `radius-sm`, sin borde ni fondo.
  - `.hora-col`: hora en 600, 15px, números tabulares; debajo, en `<small>` (12px, `color-text-secondary`), la segunda hora.
  - `.dashboard-fila-info`: `.dashboard-fila-titulo` (15px, `color-text`) y `.dashboard-fila-meta` (14px, `color-text-secondary`).
  - A la derecha, el `EstadoBadge` sm.
- `.dashboard-fila.sin-hora`: sin la columna de hora (`contenido | auto`), para Documentación.
- Hover (solo con mouse, dentro de `@media (hover: hover)`) y `:active` en `brand-50`. Foco: outline 2px `brand-600`, offset 2px.
- Subtítulos de grupo dentro de un panel: `<h3 class="dashboard-grupo-dia">` (13px, 600, mayúsculas, `color-text-secondary`).
- Debajo de 480px: la fila pasa a `48px | contenido` y el badge baja a la segunda columna, alineado a la izquierda; en `.sin-hora`, a una sola columna.

## Documentación
- Encabezado: `h2` "Documentación" y `.dashboard-resumen` "2 vencidos · 3 por vencer" (se omite la parte en cero; singular "1 vencido"). Sin badges en el encabezado.
- Lista: un `<button class="dashboard-fila sin-hora">` por documento vencido o por vencer (`GET /documentos/alertas`):
  - `.dashboard-fila-titulo`: el vehículo ("12 - AE452KD", dominio con `.patente`) o el chofer (nombre y apellido).
  - `.dashboard-fila-meta`: el tipo (`etiquetaTipoDocumento`) y la fecha con las frases de `TarjetaDocumento` en minúscula: "venció el 02 oct, hace 7 días", "vence hoy", "vence el 13 oct, en 4 días" ("hace 1 día", "en 1 día"). El año va solo si no es el año en curso.
  - `EstadoBadge` sm: Vencido (error) o Por vencer (warning).
- Orden: primero los vencidos, del más atrasado al menos atrasado; después los por vencer, del más próximo al más lejano.
- Tope de 5. Si hay más, un `Button` secondary `.dashboard-ver-mas` "Ver N más" / "Ver menos".
- Click: lleva a la ficha en Documentación (`?vehiculoId=` o `?tab=choferes&choferId=`).
- Sin alertas: `.dashboard-empty` "Sin alertas por ahora", sin ícono, con la pista "Toda la documentación registrada de vehículos y choferes está al día". Si falla: `Alert` error "No se pudieron cargar las alertas." (nunca "Sin alertas", porque no se sabe si las hay).

## Estados vacíos
- Los estados vacíos del Dashboard son solo texto, sin ícono: `.dashboard-empty` con el texto en `color-text-secondary`, centrado, sin SVG. Es igual en todos los paneles: "No hay viajes para hoy", "Nada pendiente para hoy ni mañana", "No tenés viajes programados próximamente" y "Sin alertas por ahora".
- Si hace falta una pista, va debajo en `.dashboard-empty-hint` (13px, `color-text-secondary`), como en Documentación.

## Reglas
- Fechas y horas en hora de Córdoba (`utils/fechaCordoba.js`, `utils/viajeFormato.js`, `utils/documentacion.js`).
- Textos en español rioplatense, sentence case y sin signos de exclamación.
