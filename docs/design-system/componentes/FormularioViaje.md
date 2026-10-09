Formulario para crear o editar un viaje (`Viajes.jsx`). Es un patrón de página armado con `Card`, `FormField`, `.form-grid` y las clases de formulario de `bundle.css`.

## Orden y pares de campos
Dentro de `.form-card` (720px) y `.form-grid` (dos columnas desde 640px, una columna debajo, en el mismo orden):
1. Cliente, solo: el `FormField` va envuelto en un `<div class="form-field-ancho">`, que ocupa las dos columnas. Lo mismo para Kilómetros estimados.
2. Recorrido (ancho completo): origen, paradas intermedias y destino como línea de tiempo, y debajo el botón "Ver recorrido en Google Maps". Ver `EditorRecorrido`.
3. Fecha y hora de inicio | Fecha y hora de fin.
4. Choferes posibles y Vehículos posibles, cada uno en ancho completo (`SelectorMultiple`, ver abajo). Al editar un viaje Programado en su lugar van Chofer | Vehículo como `select`.
5. Kilómetros estimados | Cantidad de pasajeros.
6. Datos administrativos (sección colapsada, ver abajo; solo para Administrador y Encargado).
7. `.form-actions`: "Crear viaje" (primary) y "Cancelar" (secondary); al editar, "Guardar cambios".

## Campos obligatorios
- Lo obligatorio se marca con `required` en `FormField`: asterisco rojo después del label. No se escribe "Opcional" en ningún campo ni hint.
- Cliente, Origen, Destino y Fecha y hora de inicio son siempre obligatorios, en cualquier estado.
- Chofer, vehículo, fecha de fin y kilómetros estimados son obligatorios solo al editar un viaje Programado. Al crear (o editar un A confirmar) son opcionales y no llevan asterisco; Cantidad de pasajeros es opcional siempre.
- El formulario no lleva leyenda ("* Obligatorio…"): el asterisco rojo alcanza. Todo viaje nace A confirmar y se confirma aparte; esa regla no se explica en la pantalla.

## Recorrido y paradas
- Las paradas son puntos intermedios ordenados entre origen y destino, de 0 a 9. Sirven para estimar kilómetros, tiempo y presupuesto: no tienen datos propios (ni hora, ni pasajeros), no cambian chofer ni vehículo y el chofer no interactúa con ellas.
- Se pueden editar en un viaje A confirmar y en uno Programado; en uno En viaje, Finalizado o Cancelado no.
- Una fila sin ubicación elegida frena el envío ("Elegí una ubicación o quitá la parada"): no se descarta en silencio.
- Con el botón del mapa el encargado lee los km y el tiempo y los carga a mano en "Kilómetros estimados".

## Choferes y vehículos posibles
- Al crear o editar un viaje A confirmar, chofer y vehículo se cargan como listas de candidatos con `SelectorMultiple` (opcionales, 0 o más). Recién se elige uno de cada uno al confirmar (`ModalConfirmarViaje`).
- Debajo de cada chip con problema se muestra el aviso de disponibilidad ("Se superpone con otro viaje programado (10:00–13:30)", "Vehículo en taller", "No habilitado para conducir", "Usuario dado de baja", "Vehículo dado de baja"). Se calcula con las fechas del formulario, con debounce, y **no bloquea el guardado**.
- Al enviar viaja un solo juego de campos: candidatos en un A confirmar, `choferId` y `vehiculoId` en un Programado.

## Confirmar viaje (modal)
- `ConfirmModal` `size="wide"`. Chofer y vehículo: un radio por candidato; los no disponibles van deshabilitados con el motivo a la derecha. Al final, "Elegir otro…" despliega un `select` con el resto de los elegibles, donde los no disponibles también van deshabilitados con el motivo en la etiqueta. Sin candidatos se muestra directamente el `select`.
- Fechas de inicio y fin y kilómetros vienen precargados y son obligatorios (con asterisco).
- Si el viaje no tiene candidatos (la lista llegó vacía), arriba de los selects va un `Alert` info que lo explica: "Este viaje no tiene choferes ni vehículos posibles cargados. Elegí uno de la lista." Si falta solo uno de los dos, el texto habla solo de ese ("… no tiene choferes posibles cargados…" arriba del select de chofer, o "… vehículos posibles …" arriba del de vehículo). Si el viaje llega sin las claves de candidatos no se afirma nada.
- Es el mismo modal, con los mismos datos, desde el detalle de Viajes y desde el panel "Viajes por confirmar" del Dashboard: los dos le pasan el viaje tal cual lo devuelve la API.
- Si no se pudo consultar la disponibilidad, todo queda habilitado: el backend valida igual al confirmar.

## Scroll
- Al abrir el formulario (alta o edición; igual en los formularios de vehículo y de usuario) la página vuelve arriba, y también al cancelar o guardar y volver al listado, porque los botones están al final del formulario.

## Datos administrativos
- `<details class="form-seccion">` con `<summary class="form-seccion-resumen">` "Datos administrativos (opcional)" y el cuerpo en `.form-seccion-cuerpo` con su propia `.form-grid`. Empieza cerrada; el chevron gira al abrir.
- Campos, los mismos que `DatosAdministrativosViaje` en la ficha, en este orden: Precio (ancho completo); Estado de pago del cliente | Fecha de pago del cliente; Método de pago del cliente (ancho); Pago al chofer (ancho); Estado de pago al chofer | Fecha de pago al chofer; Método de pago al chofer (ancho). Estados: Pendiente, Pagado, Parcial. Métodos: Efectivo, Banco, Cheque.
- Solo se muestra a Administrador y Encargado. Para el resto de los perfiles la sección no existe.
- Si el usuario no la abre o la deja vacía, no se envía nada. Si guarda el viaje y falla el guardado de los datos administrativos, el viaje no debe quedar a medias: mostrar `Alert` error "No se pudo guardar el viaje" y dejar el formulario como estaba.

## Reglas
- Un solo `h1` de página y `Button` primary solo para la acción principal.
- Los errores de campo se muestran en `FormField` (`error`), no en alerts.
