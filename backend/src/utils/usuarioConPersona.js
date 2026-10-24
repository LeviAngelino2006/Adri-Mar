// Desde la separación de personas y usuarios, el nombre y el apellido viven en
// Persona: Usuario solo guarda la cuenta (nombreUsuario, contraseña, estado).
// Las respuestas de la API siguen exponiendo al usuario que registró algo como
// { id, nombre, apellido } (lo que devolvían cuando eran columnas de Usuario),
// así el front no cambia.
// Lo usan documentoService, presupuestoService y mantenimientoService: vive en
// utils para no importar un service desde otro.

// Para el `include` de una relación a Usuario que vaya a pasar por
// nombreDeUsuario.
const SELECT_USUARIO_CON_NOMBRE = {
  select: { id: true, persona: { select: { nombre: true, apellido: true } } },
};

// personaId es obligatorio en Usuario, así que la persona siempre viene.
function nombreDeUsuario(usuario) {
  if (!usuario) return null;
  return { id: usuario.id, nombre: usuario.persona.nombre, apellido: usuario.persona.apellido };
}

module.exports = { SELECT_USUARIO_CON_NOMBRE, nombreDeUsuario };
