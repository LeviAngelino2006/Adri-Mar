Modales para comenzar y finalizar un viaje: piden la lectura del odómetro. Usan las clases de `ConfirmModal` (`.confirm-modal`, `.confirm-modal-icon-brand`, `.confirm-modal-description`, `.confirm-modal-actions`) con un `FormField` dentro de la descripción. Los abren `ViajeEnCurso` (Finalizar viaje), `ProximosViajes` (Comenzar viaje) y la ficha en Mis viajes, siempre con el mismo modal.

## Lo que contienen
- `ConfirmModal` `tone="brand"`, título "Comenzar viaje" / "Finalizar viaje", botón "Comenzar viaje" / "Finalizar viaje" ("Comenzando…" / "Finalizando…" mientras corre) y "Volver".
- Primer párrafo: "Último odómetro registrado: <strong class="num">110.030 km</strong>" (separador de miles es-AR, números tabulares). Reemplaza al texto "Kilometraje actual del vehículo".
- `FormField` "Odómetro al comenzar (km)" / "Odómetro al finalizar (km)" con `required`.
- Solo en Finalizar: `FormField` "Observación" (textarea, con contador `.contador-texto` "0 / 500").

## Reglas
- No se muestra la línea "Chofer …, vehículo …": el chofer ya sabe qué viaje está operando.
- El error de odómetro ("Debe ser mayor o igual a la lectura anterior.") va en el `FormField`.
