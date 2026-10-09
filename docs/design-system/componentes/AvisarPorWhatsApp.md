Abre WhatsApp con el aviso de un viaje confirmado ya escrito para el chofer. Solo para Administrador y Encargado, y solo sobre un viaje Programado.

No está en `bundle.js`: arma el link con `utils/whatsapp`. La vista previa es una representación estática con sus clases CSS.

## Lo que provee quien lo usa
- `viaje`: el viaje tal como lo devuelve la API para un gestor (necesita `chofer.telefono`, el recorrido con sus paradas, el vehículo, el cliente y las fechas).
- `variante`: `boton` (por defecto) o `enlace`.

## Reglas
- **Botón**: es un `<a href target="_blank" rel="noopener noreferrer">` con el aspecto de `Button` secondary, con un ícono de mensaje; no un `window.open`. En el celular el link lo toma la app de WhatsApp. Va en el detalle de un viaje Programado, junto a Editar y Cancelar.
- **Si no se puede avisar** el botón queda deshabilitado y dice por qué, en el tooltip y en un texto visible debajo (el tooltip no se ve en el celular), con `aria-describedby`:
  - Sin teléfono cargado: "El chofer no tiene teléfono cargado".
  - Con un teléfono que no se entiende: "El teléfono del chofer no tiene un formato válido. Corregilo en Usuarios."
- **Enlace**: texto "Avisar por WhatsApp" en negrita y subrayado, para la acción del `Toast` de éxito al confirmar. Si no se puede avisar no muestra nada (un enlace deshabilitado en un toast es ruido); el botón del detalle sigue estando con su motivo.

## Teléfono
El teléfono se guarda como texto libre. `normalizarTelefonoAR` lo convierte al formato internacional argentino de celular (`549` + 10 dígitos, sin signos) y devuelve `null` en vez de adivinar:
- Acepta espacios, guiones, puntos y paréntesis, con `+54`, `0054` o `54`, con o sin el 9 de celular, y el discado nacional con el 0 inicial y con o sin el 15 ("03571 15-612345", "3571612345", "+54 9 3571 61-2345").
- No acepta: vacío, letras o extensiones ("int 12"), dos números en uno, números de otro país, un número sin característica ("15 612345"), una característica inexistente (las de 2 dígitos son solo "11"; el resto empieza con 2 o 3) ni una longitud distinta de 10 dígitos.
- Con 12 dígitos hay un "15" intercalado. Si puede estar en más de una posición (característica de 2, 3 o 4 dígitos) se aceptan solo las interpretaciones que dan el mismo número final ("11 15 1512 3456" es válido); si dieran números distintos se rechaza, para no adivinar.

## Mensaje
Va con las negritas de WhatsApp (`*así*`) y **sin emojis**: los que están fuera del plano básico de Unicode (📅, 🚌, 🗺️…) llegan como "�" en WhatsApp Desktop de Windows al abrir el link `wa.me`. La flecha → y los acentos sí se ven bien. Un test verifica que ningún carácter del mensaje supere U+FFFF, para que no vuelvan a entrar. Las líneas cuyo dato falta se omiten.

```
Hola Ana, te confirmo el viaje del *martes 20/10*.

*Horario:* 08:00 a 12:30
*Vehículo:* Interno 12 (AE452KD)
*Recorrido:* Río Tercero → Córdoba
*Pasajeros:* 45
*Cliente:* ACME

Ver el recorrido en el mapa:
https://www.google.com/maps/dir/?api=1&…
```
- El día de la semana va en español y en minúscula, y la fecha y las horas, en hora de Córdoba.
- Si el viaje termina otro día, cada hora lleva su fecha: `*Horario:* 22:00 del 20/10 a 06:00 del 21/10`.
- Con paradas el recorrido va en vertical: `*Recorrido:*` en su línea, después el origen y cada punto siguiente en su propia línea con `→ ` adelante:
  ```
  *Recorrido:*
  Río Tercero
  → Alta Gracia
  → Museo del Kempes
  → Córdoba
  ```
- `*Pasajeros:*` solo aparece si la cantidad está cargada.
- Al final, en un bloque separado por una línea en blanco, el link de Google Maps: el mismo de "Ver recorrido en Google Maps" (`urlRecorrido`). Sin origen o sin destino no hay link y tampoco el bloque.
