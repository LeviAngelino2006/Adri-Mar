Tarjeta que se elige con un toque, para opciones que conviene ver enteras antes de elegir. La usan los choferes y vehículos posibles de un viaje: en el alta y la edición de un A confirmar con selección múltiple (`SeleccionTarjetas`), y en el modal de confirmar con selección única (`SeleccionCandidato`).

No está en `bundle.js`. La vista previa es una representación estática con sus clases CSS.

## Lo que provee quien la usa
- `tipo`: `checkbox` (por defecto, selección múltiple) o `radio` (selección única; todo el grupo comparte `name`).
- `titulo`, `detalles` (textos secundarios, uno por línea), `estado` (`{ texto, tono: 'ok' | 'error' | 'neutral' }`) y `aviso` (texto informativo, opcional).
- `seleccionada` y `onChange()`: es controlada.
- `deshabilitada`: no se puede elegir.
- El contenido de choferes y vehículos lo arma `utils/tarjetasCandidatos` (`tarjetaChofer`, `tarjetaVehiculo`): no decide quién es elegible ni valida documentación, solo muestra el `disponible` / `motivo` que ya trae cada item.

## Contenido
- Chofer: nombre completo y estado de habilitación.
- Vehículo: "Interno 12", "Patente AE452KD", la cantidad de asientos si el dato existe ("45 asientos") y el estado de habilitación.
- Estado: "Habilitado" en `state-success-text`, el motivo en `state-error-text` ("Documentación vencida (Licencia de conducir)"), o "Verificando…" en `color-text-secondary` (tono `neutral`) mientras el modal de confirmar consulta la disponibilidad; en ese caso la tarjeta va deshabilitada.
- Aviso: en `state-warning-text`, debajo del estado (por ejemplo, una superposición de horario). Nunca bloquea. Con aviso, la tarjeta no elegida lleva el borde `state-warning-border`.

## Reglas
- Accesibilidad: la tarjeta es un `<label>` que contiene un `input` real (checkbox o radio) visualmente oculto (como `.sr-only`, pero en el orden de tabulación). Funciona con teclado: Tab, espacio, y flechas entre los radios. El estado y el aviso se anuncian con `aria-describedby`.
- Foco visible en la tarjeta entera: el anillo global (2px `brand-600`, offset 2px), con `:has(input:focus-visible)`.
- Elegida: fondo `brand-50` y borde de 2px `brand-600` (1px de borde + sombra interior, para que el contenido no salte), y la marca (casilla o círculo de 18px) rellena en `brand-600`. No depende solo del color del texto.
- Deshabilitada: fondo `color-bg`, título y detalles en `color-text-secondary`, cursor `not-allowed`, input `disabled` y el motivo visible. Si ya venía elegida (un dato guardado antes de que venciera el documento) se puede quitar, pero no volver a elegir: si no, quedaría trabada.
- Base: fondo `color-surface`, borde 1px `color-border`, radio `radius-md`, padding `space-3`, alto mínimo 44px. Hover (solo con mouse) y toque: borde `brand-200`.
- Título en 600; detalles en 14px y `color-text-secondary`; estado y aviso en 13px.
- Grilla (`.tarjetas-seleccionables`): una columna en el celular (390px) y desde 640px tantas columnas como entren con un mínimo de 200px; separación `space-2`.

## SeleccionTarjetas (selección múltiple)
- `fieldset` con `legend` (mismo estilo que el label de `FormField`); no va dentro de `FormField`. Trae su `hint`, su `error` (`form-field-error`, `role="alert"`) y un `textoVacio` ("Cargando choferes…", "No hay choferes para elegir").
- Mismo contrato que tenía `SelectorMultiple`: `valor` son los ids elegidos y `onChange(ids)` recibe la lista nueva en el orden en que se eligió. Un id de `valor` que no está en las opciones se muestra como "#id", elegido, para no perder datos.
- `avisos` (`{ [id]: texto }`) van en la tarjeta de ese id; si repiten el motivo del estado no se muestran dos veces.
- Con error, la primera tarjeta que se puede tocar lleva `aria-invalid` (así `useFocoEnPrimerError` lleva el foco al grupo) y las no elegidas marcan el borde en `state-error-border`.
