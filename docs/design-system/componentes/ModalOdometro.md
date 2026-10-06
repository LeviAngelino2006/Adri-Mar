Modales para comenzar y finalizar un viaje: piden la lectura del odómetro. Usan las clases de `ConfirmModal` (`.confirm-modal`, `.confirm-modal-icon-brand`, `.confirm-modal-description`, `.confirm-modal-actions`) con un `FormField` dentro de la descripción. Los abren `ViajeEnCurso` (Finalizar viaje), `ProximosViajes` (Comenzar viaje) y la ficha en Mis viajes, siempre con el mismo modal.

## Lo que contienen
- `ConfirmModal` `tone="brand"`, título "Comenzar el viaje" / "Finalizar el viaje", botón de confirmar "Comenzar viaje" / "Finalizar viaje" ("Comenzando…" / "Finalizando…" mientras corre) y botón "Cancelar".
- Primer párrafo: "Último odómetro registrado: <strong class="num">110.030 km</strong>" (separador de miles es-AR, números tabulares). Reemplaza al texto "Kilometraje actual del vehículo".
- `FormField` "Odómetro inicial (km)" / "Odómetro final (km)" con `required`.
- Solo en Finalizar: `FormField` "Observación" (textarea, con placeholder "Algo para destacar del viaje" y contador `.contador-texto` "0 / 1000").

## Reglas
- No se muestra la línea "Chofer …, vehículo …": el chofer ya sabe qué viaje está operando.
- Los errores de odómetro vienen del backend y van en el `FormField` ("El valor no puede ser menor a la última lectura registrada (N km)"). Los demás (409 por otro viaje En viaje, 403, 404) se muestran tal cual dentro del modal, que queda abierto con lo cargado; si no hay mensaje, "No se pudo completar la acción".
- Éxito: toast "Viaje comenzado correctamente." / "Viaje finalizado correctamente. Se actualizó el kilometraje del vehículo."
