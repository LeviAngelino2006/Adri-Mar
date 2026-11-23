// Quién puede operar un viaje y quién ve sus datos administrativos.

// Gestores: pueden Comenzar/Finalizar cualquier viaje. El chofer asignado
// también puede, sobre SU PROPIO viaje, sin importar su perfil (cualquier
// usuario habilitado para conducir puede ser chofer, SCRUM-27). Por eso no
// alcanza con el `autorizar(...)` de rol de las rutas: el chequeo necesita el
// viaje cargado (su choferId) y se hace en el service. Editar/Cancelar no usan
// este helper: son exclusivos de gestor.
const PERFILES_GESTORES_VIAJE = ['ADMINISTRADOR', 'ENCARGADO'];

// Viaje.choferId es id de PERSONA: se compara SOLO con el personaId del token.
// El id de usuario es de otra tabla, con otra secuencia; que coincidan es
// casualidad (y deja de pasar apenas se da de alta una persona sin cuenta).
// autenticar ya rechaza los tokens sin personaId.
function esElChoferDelViaje(usuarioSolicitante, viaje) {
  return viaje.choferId != null && viaje.choferId === usuarioSolicitante.personaId;
}

function puedeOperarViaje(usuarioSolicitante, viaje) {
  return (
    PERFILES_GESTORES_VIAJE.includes(usuarioSolicitante.perfil) || esElChoferDelViaje(usuarioSolicitante, viaje)
  );
}

// Los datos administrativos/financieros (precio, pagos al cliente y al chofer)
// solo los ven los gestores. Es una restricción de la RESPUESTA, no de la
// acción: se aplica en serializarViaje, así que cubre por igual cualquier
// endpoint que devuelva un viaje (listados, comenzar/finalizar de un chofer
// dueño del viaje, etc.).
const PERFILES_CON_DATOS_ADMINISTRATIVOS = ['ADMINISTRADOR', 'ENCARGADO'];

// Falla cerrado: si por un descuido un call site no pasa al solicitante, los
// datos se ocultan en vez de filtrarse.
function puedeVerDatosAdministrativos(usuarioSolicitante) {
  return Boolean(usuarioSolicitante) && PERFILES_CON_DATOS_ADMINISTRATIVOS.includes(usuarioSolicitante.perfil);
}

// Qué viajes puede ver quien pide. ÚNICO lugar donde se decide: el listado, los
// endpoints de un viaje puntual y el middleware `exigirAccesoAViajes` lo usan, y
// cualquier lectura nueva de viajes tiene que pasar por acá.
//   TODOS:   Administrador y Encargado.
//   PROPIOS: solo donde la persona es el chofer asignado. Es el Chofer y el
//            Personal de Taller habilitado para conducir.
//   NINGUNO: Personal de Taller sin habilitación para conducir. No es un
//            permiso que se pueda recuperar con un filtro: no ve ningún viaje.
// Falla cerrado: sin solicitante, o con un perfil que no se conoce, no ve nada.
const ALCANCE_VIAJES = Object.freeze({ TODOS: 'TODOS', PROPIOS: 'PROPIOS', NINGUNO: 'NINGUNO' });

function alcanceDeViajes(usuarioSolicitante) {
  if (!usuarioSolicitante) return ALCANCE_VIAJES.NINGUNO;
  const { perfil, habilitadoParaConducir } = usuarioSolicitante;
  if (PERFILES_GESTORES_VIAJE.includes(perfil)) return ALCANCE_VIAJES.TODOS;
  if (perfil === 'CHOFER') return ALCANCE_VIAJES.PROPIOS;
  if (perfil === 'PERSONAL_TALLER') {
    return habilitadoParaConducir === true ? ALCANCE_VIAJES.PROPIOS : ALCANCE_VIAJES.NINGUNO;
  }
  return ALCANCE_VIAJES.NINGUNO;
}

module.exports = {
  ALCANCE_VIAJES,
  alcanceDeViajes,
  esElChoferDelViaje,
  puedeOperarViaje,
  puedeVerDatosAdministrativos,
};
