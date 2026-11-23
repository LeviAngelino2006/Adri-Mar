Envuelve un control con su label, hint y mensaje de error accesibles.

## Lo que provee quien lo usa
- `id`: se inyecta al control hijo y enlaza el `<label>`.
- `label`: texto del label (estilo `label`).
- `children`: UN control (`input`, `select`, `textarea`). Recibe `id`, `aria-invalid` y `aria-describedby` automáticamente.
- `required` opcional: agrega un asterisco rojo (`.form-field-required`, `state-error-text`, `aria-hidden`) después del label y `aria-required` al control. No usa el atributo nativo `required`: los formularios validan por su cuenta (`noValidate`). Marcá solo lo obligatorio y no escribas "Opcional" en los campos que no lo son.
- `ayuda` opcional: texto estático de formato o explicación ("Formato AB123CD o ABC123", "7 u 8 dígitos, sin puntos"). Va en un `AyudaTooltip` (ícono "?") junto al label, fuera del `<label>`, y queda en el `aria-describedby` del control aunque el popover esté cerrado. Se mantiene aunque haya error.
- `hint` opcional (estilo `caption`, color `color-text-secondary`): solo para lo que tiene que quedar a la vista (ver la tabla). Se oculta cuando hay error.

## ¿`ayuda` (tooltip) o `hint` (visible)?
Va visible si el usuario lo necesita antes de escribir o si equivocarse sale caro (plata, requisitos de contraseña). También va visible lo que muestra datos del registro o un estado. El resto (formato o explicación que se consulta solo si hay dudas) va en tooltip. Un texto que repite el label o dice "Opcional" no va.

| Tipo de texto | Va como | Ejemplos |
| --- | --- | --- |
| Datos del registro o del cálculo | `hint` visible | "Odómetro actual: X km", "Vence el …", el importe leído ("$ 420.000,00"), "Se mantiene el PDF actual (X)" |
| Estado de carga o de la pantalla | `hint` visible | "Cargando…", "Elegí origen y destino para calcularlos", "No hay personas activas sin cuenta de usuario", "Tu perfil lo cambia un Administrador." |
| Lo necesita antes de escribir, o equivocarse sale caro | visible | "Al menos 8 caracteres" (contraseña nueva, alta de usuario); la aclaración del IVA del presupuesto (fuera del `FormField`, para que el error no la tape) |
| Formato o ejemplo | `ayuda` (tooltip) | "Formato AB123CD o ABC123", "7 u 8 dígitos, sin puntos", "Por ejemplo 420.000 o 420.000,50", "Máximo 15 MB." |
| Explicación de cómo se usa el campo | `ayuda` (tooltip) | "Vacío = A confirmar", "Si lo dejás vacío, se toma el kilometraje actual.", "Es provisoria: la persona la va a tener que cambiar la primera vez que ingrese.", "Incluye: Cambio de aceite + …" |
| Repite el label o dice "Opcional" | se borra | "En kilómetros" en "Km del odómetro" |
- `error` opcional (estilo `caption`, color `state-error-text`, role="alert"). El borde del control pasa a `state-error-border`.

## Reglas
- Los controles miden mínimo 44px de alto, padding `space-2` × `space-3`, borde `color-border`, radio `radius-sm`.
- Foco (input, select y textarea por igual): outline 2px `brand-600` con offset -2px, por dentro del control, tapando el borde. Lo da la regla global de `index.css`, no `FormField`: vale también para los campos que no van en un `FormField` (el buscador de los listados). Por dentro y no por fuera porque, con offset 2px, el cuerpo con scroll de los modales recortaba el anillo: un textarea a todo el ancho mostraba solo el borde de abajo.
- Dentro de `.form-grid` los campos pasan a dos columnas desde 640px.
- Los campos de contraseña usan `InputContrasena` (`components/ui/InputContrasena.jsx`), que agrega el botón para mostrar/ocultar la contraseña (44×44 px) y oculta el ícono nativo de Edge (`::-ms-reveal`).
- Validá todo junto antes de enviar, así los errores salen en una sola vuelta (el backend valida igual). Al mostrar los errores, el foco y el scroll van al primer campo con error: `useFocoEnPrimerError` (`hooks/useFocoEnPrimerError.js`) busca el primer control con `aria-invalid` en el `<form>`; si el error es general, scrollea hasta el `Alert`.

## Select: la opción vacía (`OpcionVacia`)
Todo `select` de formulario arranca con `OpcionVacia` (`components/ui/OpcionVacia.jsx`), la opción de `value=""`. Nunca escribas esa opción a mano: un test (`opcionVacia.render.test.mjs`) falla si aparece un `<option value="">` fuera de los filtros.
- **Obligatorio** (el campo lleva `required` en `FormField`): `<OpcionVacia obligatorio>Elegí el vehículo</OpcionVacia>`. Es un placeholder: se ve mientras no hay nada elegido, pero va `disabled` y `hidden`, así que no aparece en la lista ni se puede volver a él. Texto: "Elegí" + lo que se elige ("Elegí el tipo de trabajo", "Elegí el perfil"); mientras la lista carga, "Cargando…".
- **Opcional**: `<OpcionVacia>Sin definir</OpcionVacia>`. Es una opción más, elegible, para volver a "sin valor" (los datos administrativos del viaje).
- Los filtros de los listados no la usan: su primera opción, "Todos", es un valor del filtro.

| Select | Tipo | Opción vacía |
| --- | --- | --- |
| Viajes (chofer y vehículo de un viaje Programado) | obligatorio | "Elegí el chofer", "Elegí el vehículo" |
| Confirmar viaje ("Elegir otro…") | obligatorio | "Elegí el chofer", "Elegí el vehículo" |
| Flota (tipo de vehículo) | obligatorio | "Elegí el tipo de vehículo" |
| Mantenimiento: registrar service (vehículo) y arreglos (vehículo y tipo de trabajo) | obligatorio | "Elegí el vehículo", "Elegí el tipo de trabajo" |
| Personal (perfil) | obligatorio | "Elegí el perfil" |
| Usuarios (persona de la cuenta) | obligatorio | "Elegí la persona" |
| Datos administrativos del viaje (estados y métodos de pago) | opcional | "Sin definir" |
