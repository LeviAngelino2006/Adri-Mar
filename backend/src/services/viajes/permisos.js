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

module.exports = {
  esElChoferDelViaje,
  puedeOperarViaje,
  puedeVerDatosAdministrativos,
};
