// Qué viajes puede ver quien inició sesión. Espeja a alcanceDeViajes del backend
// (backend/src/services/viajes/permisos.js), que es la fuente de verdad: acá solo
// se decide qué mostrar y a dónde redirigir; el backend responde 403 igual.
//   'TODOS':   Administrador y Encargado.
//   'PROPIOS': Chofer y Personal de Taller habilitado para conducir.
//   'NINGUNO': Personal de Taller sin habilitación para conducir.
export function alcanceDeViajes(usuario) {
  if (!usuario) return 'NINGUNO';
  if (usuario.perfil === 'ADMINISTRADOR' || usuario.perfil === 'ENCARGADO') return 'TODOS';
  if (usuario.perfil === 'CHOFER') return 'PROPIOS';
  if (usuario.perfil === 'PERSONAL_TALLER') return usuario.habilitadoParaConducir === true ? 'PROPIOS' : 'NINGUNO';
  return 'NINGUNO';
}

export const puedeVerViajes = (usuario) => alcanceDeViajes(usuario) !== 'NINGUNO';
