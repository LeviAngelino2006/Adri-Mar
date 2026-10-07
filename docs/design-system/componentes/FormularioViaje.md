Formulario para programar o editar un viaje (`Viajes.jsx`). Es un patrón de página armado con `Card`, `FormField`, `.form-grid` y las clases de formulario de `bundle.css`.

## Orden y pares de campos
Dentro de `.form-card` (720px) y `.form-grid` (dos columnas desde 640px, una columna debajo, en el mismo orden):
1. Cliente, solo: el `FormField` va envuelto en un `<div class="form-field-ancho">`, que ocupa las dos columnas. Lo mismo para Kilómetros estimados.
2. Origen | Destino.
3. Fecha y hora de inicio | Fecha y hora de fin.
4. Chofer | Vehículo.
5. Kilómetros estimados, solo y al final.
6. Datos administrativos (sección colapsada, ver abajo; solo para Administrador y Encargado).
7. `.form-actions`: "Confirmar viaje" (primary) y "Cancelar" (secondary).

## Campos obligatorios
- Lo obligatorio se marca con `required` en `FormField`: asterisco rojo después del label. No se escribe "Opcional" en ningún campo ni hint.
- Cliente, Origen y Destino son siempre obligatorios.
- Chofer, vehículo, fecha de inicio, fecha de fin y kilómetros estimados son obligatorios solo al editar un viaje Programado. Al crear (o editar un A confirmar) son opcionales y no llevan asterisco.
- El formulario no lleva leyenda ("* Obligatorio…"): el asterisco rojo alcanza. La regla de estado (con chofer, vehículo, fechas y kilómetros queda Programado; si no, A confirmar) no se explica en la pantalla.

## Datos administrativos
- `<details class="form-seccion">` con `<summary class="form-seccion-resumen">` "Datos administrativos (opcional)" y el cuerpo en `.form-seccion-cuerpo` con su propia `.form-grid`. Empieza cerrada; el chevron gira al abrir.
- Campos, los mismos que `DatosAdministrativosViaje` en la ficha, en este orden: Precio (ancho completo); Estado de pago del cliente | Fecha de pago del cliente; Método de pago del cliente (ancho); Pago al chofer (ancho); Estado de pago al chofer | Fecha de pago al chofer; Método de pago al chofer (ancho). Estados: Pendiente, Pagado, Parcial. Métodos: Efectivo, Banco, Cheque.
- Solo se muestra a Administrador y Encargado. Para el resto de los perfiles la sección no existe.
- Si el usuario no la abre o la deja vacía, no se envía nada. Si guarda el viaje y falla el guardado de los datos administrativos, el viaje no debe quedar a medias: mostrar `Alert` error "No se pudo guardar el viaje" y dejar el formulario como estaba.

## Reglas
- Un solo `h1` de página y `Button` primary solo para la acción principal.
- Los errores de campo se muestran en `FormField` (`error`), no en alerts.
