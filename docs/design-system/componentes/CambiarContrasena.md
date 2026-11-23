Pantalla para cambiar la propia contraseña obligatoria en `/cambiar-contrasena` (`CambiarContrasena.jsx`) y formulario reutilizable (`FormularioCambiarContrasena.jsx`), para todos los perfiles. Cuando la contraseña ya no es provisoria, `/cambiar-contrasena` redirige a `/mi-perfil`, donde vive el cambio voluntario.

## Obligatoria (contraseña provisoria)
Cuando un gestor crea la cuenta o le cambia la contraseña a otro, la contraseña es provisoria (`debeCambiarContrasena`). Hasta cambiarla, `ProtectedRoute` lleva todas las rutas acá y el backend responde 403 (`DEBE_CAMBIAR_CONTRASENA`) a todo salvo `/auth/me` y el cambio.
- Sin la navegación: la estructura de `Login` (`.login-page`, `.login-brand` con el panel de marca y `Card.login-card` con el logo).
- `h1` visible "Cambiar contraseña" (`.cambiar-contrasena-titulo`, centrado) y un texto de apoyo en `color-text-secondary` (`.cambiar-contrasena-texto`): "Hola, {nombre}. Tu contraseña es provisoria: la definió quien te dio el acceso. Elegí una nueva para seguir."
- Los tres campos uno debajo del otro, el `Button` primary de ancho completo (`.login-submit`) y, debajo, "Cerrar sesión" en `ghost`, también de ancho completo. Es la única salida.
- Al cambiarla, entra al Dashboard.

## Por elección (en Mi perfil)
Se accede desde el bloque del usuario al pie de la sidebar (`/mi-perfil`, `MiPerfil.jsx`), dentro del `Layout`:
- Sección "Cambiar mi contraseña" dentro de su propia `Card`, usando `FormularioCambiarContrasena` con `.form-grid` (2 columnas desde 640px).
- Pares: Contraseña actual (sola en su fila, con `.form-hueco`) y Contraseña nueva | Repetí la contraseña nueva.
- `.form-actions`: "Cambiar contraseña" (primary).
- Al cambiarla, `Toast` "Contraseña cambiada correctamente.", los campos se vacían y sigue en la pantalla.

## Campos y errores
- Los tres llevan `required` y son `type="password"`: "Contraseña actual" (`current-password`), "Contraseña nueva" (`new-password`, hint "Al menos 8 caracteres") y "Repetí la contraseña nueva" (`new-password`). Un campo `username` oculto de solo lectura ayuda al gestor de contraseñas del navegador.
- Se valida todo junto antes de enviar, con las reglas del backend: la actual es obligatoria; la nueva, obligatoria, sin solo espacios, de 8 o más caracteres y distinta de la actual; y las dos nuevas tienen que coincidir ("Las contraseñas no coinciden"). El foco va al primer error (`useFocoEnPrimerError`).
- Una contraseña actual incorrecta vuelve del backend en su campo: "La contraseña actual no es correcta". Después de 5 intentos fallidos, el backend responde 429 y el mensaje va en un `Alert` error.
- Mientras guarda, "Cambiando…".
