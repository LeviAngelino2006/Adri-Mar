Pantalla de inicio de sesión: panel de marca en `brand-600` y la card del formulario. Patrón de página (`Login.jsx`).

## Lo que provee quien lo usa
- `<main class="login-page">` con dos partes:
  - `.login-brand`: el panel de marca, con `.login-brand-titulo` ("Adri-Mar Gestión Online", 700, `color-on-brand`) y `.login-brand-sub` (una línea en `brand-100`: "Viajes, flota y mantenimiento").
  - `.login-main` con `Card.login-card` (máximo 400px): el logo (`.login-logo`, hasta 220px) sobre blanco, un `h1` "Iniciar sesión" en `sr-only` y el formulario.
- `FormField` "Usuario" (autocomplete username) y "Contraseña" (current-password). Si falla, `Alert` error con el mensaje del backend. Al final, `Button` primary `.login-submit`, de ancho completo: "Ingresar", y "Ingresando…" mientras carga.

## Reglas
- Desde 768px el panel es la columna izquierda (2/5 del ancho) y la card queda centrada a la derecha sobre `color-bg`. En mobile el panel es una banda arriba y la card se superpone `space-12` sobre ella.
- El logo va siempre sobre blanco (dentro de la card), nunca sobre el azul.
- Card con `shadow-md`.
- Sin enlaces extra (registro, recuperar contraseña): los usuarios los da de alta un Administrador.
