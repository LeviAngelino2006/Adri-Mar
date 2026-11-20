Abre WhatsApp con el aviso de un viaje confirmado ya escrito para el chofer asignado. Solo para Administrador y Encargado, y solo sobre un viaje Programado. Se le manda únicamente al chofer asignado, y solo desde el detalle del viaje (el listado no tiene esta acción).

No está en `bundle.js`. El texto lo arma `armarMensajeWhatsApp(viaje)` (`utils/whatsapp`, función pura) y el componente solo arma el link `https://wa.me/<teléfono>?text=<encodeURIComponent(mensaje)>`. La vista previa es una representación estática con sus clases CSS.

## Lo que provee quien lo usa
- `viaje`: el viaje tal como lo devuelve la API para un gestor (necesita `chofer.telefono`, el recorrido con sus paradas, el vehículo, el cliente y las fechas).
- `variante`: `boton` (por defecto) o `enlace`.

## Reglas
- **Botón**: es un `<a href target="_blank" rel="noopener noreferrer">` con el aspecto de `Button` secondary, con un ícono de mensaje; no un `window.open`. En el celular el link lo toma la app de WhatsApp. Va en el detalle de un viaje Programado, junto a Editar y Cancelar.
- **Si no se puede avisar** el botón queda deshabilitado y dice por qué, en el tooltip y en un texto visible debajo (el tooltip no se ve en el celular), con `aria-describedby`:
  - Sin chofer asignado: "El viaje no tiene chofer asignado".
  - Sin teléfono cargado: "El chofer no tiene teléfono cargado".
  - Con un teléfono que no se entiende: "El teléfono del chofer no tiene un formato válido. Corregilo en Usuarios."
- **Enlace**: texto "Avisar por WhatsApp" en negrita y subrayado, para la acción del `Toast` de éxito al confirmar. Si no se puede avisar no muestra nada (un enlace deshabilitado en un toast es ruido); el botón del detalle sigue estando con su motivo.

## Teléfono
El teléfono se guarda como texto libre. `normalizarTelefonoAR` lo convierte al formato internacional argentino de celular (`549` + 10 dígitos, sin signos) y devuelve `null` en vez de adivinar:
- Acepta espacios, guiones (también el largo `–`/`—` que queda al pegar desde otro programa), puntos y paréntesis, con `+54`, `0054` o `54`, con o sin el 9 de celular, y el discado nacional con el 0 inicial y con o sin el 15 ("03571 15-612345", "3571612345", "+54 9 3571 61-2345"). También entiende el 9 junto con el 0 o el 15 del discado nacional ("+54 9 0351 412-3456", "+54 9 3571 15 612345").
- No acepta: vacío, letras o extensiones ("int 12"), dos números en uno, números de otro país, un número sin característica ("15 612345"), una característica inexistente (las de 2 dígitos son solo "11"; el resto empieza con 2 o 3) ni una longitud distinta de 10 dígitos.
- Con 12 dígitos hay un "15" intercalado. Si puede estar en más de una posición (característica de 2, 3 o 4 dígitos) se aceptan solo las interpretaciones que dan el mismo número final ("11 15 1512 3456" es válido); si dieran números distintos se rechaza, para no adivinar.

## Mensaje
Un saludo corto con el nombre del chofer y debajo un dato por línea, con la etiqueta en negrita de WhatsApp (`*Etiqueta:*`). **Sin emojis**: los que están fuera del plano básico de Unicode (📅, 🚌, 🗺️…) llegan como "�" en WhatsApp Desktop de Windows al abrir el link `wa.me`. Un test verifica que ningún carácter del mensaje supere U+FFFF.

```
Hola Ana, te paso los datos de tu viaje:

*Fecha:* martes 20/10/2026
*Hora de inicio:* 08:00
*Hora estimada de fin:* 12:30
*Origen:* Río Tercero
*Parada 1:* Alta Gracia
*Parada 2:* Museo del Kempes
*Destino:* Córdoba
*Cliente:* ACME
*Pasajeros:* 45
*Vehículo:* Interno 12, patente AE452KD
*Recorrido en Google Maps:* https://www.google.com/maps/dir/?api=1&…
```
- Fecha y horas en formato argentino y en hora de Córdoba (`formatearFechaConDia` y `formatearHora` de `utils/viajeFormato`).
- Si el viaje termina otro día, la hora de fin lleva su fecha: `*Hora estimada de fin:* 06:00 del miércoles 21/10/2026`.
- Las paradas van en el orden del recorrido, una por línea (`*Parada 1:*`, `*Parada 2:*`…), entre el origen y el destino.
- Los datos opcionales que no están cargados (paradas, pasajeros, hora de fin) se omiten: nunca sale "No cargado" ni una línea vacía. Lo mismo con cualquier otro dato que falte en un viaje incompleto.
- El link de Google Maps es el mismo de "Ver recorrido en Google Maps" (`urlRecorrido`).
