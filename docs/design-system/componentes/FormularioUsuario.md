Formulario para crear o editar un usuario (`Usuarios.jsx`). Patrón de página armado con `Card`, `FormField`, `Switch` y `.form-grid`.

## Estructura
- `.back-link`, `h1` ("Crear usuario" o "Editar usuario", igual que la acción del listado) y una `Card` `.form-card` (720px) con un solo `.form-grid`: dos columnas desde 640px, una debajo, en el mismo orden. Sin títulos de sección.

## Pares de campos
1. Nombre | Apellido
2. DNI | Teléfono
3. Email, a ancho completo (`<div class="form-field-ancho">`)
4. Nombre de usuario | Contraseña. Al editar no hay Contraseña: Nombre de usuario queda solo en su fila, sin ocupar el ancho completo (un `<div class="form-hueco" aria-hidden="true" />` guarda el lugar).
5. Perfil | Habilitado para conducir. El switch va en `.form-field.switch-field.switch-field-par`, alineado con el select: `align-self: start` y, desde 640px, un margen superior de `calc(1.5em + space-1)` (el alto del label más el gap del `FormField`), con alto mínimo 44px. Así, un error debajo de Perfil no lo corre. En una columna va debajo de Perfil, sin ese margen.

## Obligatorios y hints
- Llevan `required`: Nombre, Apellido, DNI, Email, Nombre de usuario, Contraseña (solo en el alta) y Perfil. Teléfono no. Todo según `usuarioService`.
- DNI: hint "7 u 8 dígitos, sin puntos".
- Contraseña: hint "Al menos 8 caracteres".
- Los errores de validación vienen del backend y se muestran en cada campo.

## Habilitado para conducir
- En el alta, con perfil Chofer, el switch queda encendido y bloqueado. Al salir de Chofer vuelve a apagado; entre otros perfiles conserva lo que se eligió.
- Al editar, el switch es siempre editable.

## Botones
- `.form-actions`: "Crear usuario" en el alta o "Guardar cambios" al editar (primary; mientras guarda, "Guardando…") y "Cancelar" (secondary).

## Scroll
- Al abrir el formulario y al volver al listado la página vuelve arriba.
