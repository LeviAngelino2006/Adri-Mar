// Fachada del dominio de viajes: la lógica vive en services/viajes/. Este
// archivo solo re-exporta, para que controllers, rutas y tests no cambien.
const {
  PermisoDenegadoError,
  ViajeEnCursoError,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  YaCanceladoError,
  EstadoNoConfirmableError,
} = require('./viajes/errores');
const { puedeOperarViaje } = require('./viajes/permisos');
const { pendienteAdministrativo, FILTRO_ADMINISTRATIVO_PENDIENTE } = require('./viajes/serializacion');
const { disponibilidadDeViaje, disponibilidadParaAlta } = require('./viajes/disponibilidad');
const {
  listarEstadosPago,
  listarMetodosPago,
  actualizarDatosAdministrativos,
} = require('./viajes/datosAdministrativos');
const { confirmarViaje, cancelarViaje, comenzarViaje, finalizarViaje } = require('./viajes/ciclo');
const { ESTADOS_VIAJE_VALIDOS, listarViajes, opcionesFiltrosViajes } = require('./viajes/listado');
const { crearViaje, actualizarViaje } = require('./viajes/abm');

module.exports = {
  crearViaje,
  listarViajes,
  opcionesFiltrosViajes,
  actualizarViaje,
  actualizarDatosAdministrativos,
  listarEstadosPago,
  listarMetodosPago,
  confirmarViaje,
  disponibilidadDeViaje,
  disponibilidadParaAlta,
  cancelarViaje,
  comenzarViaje,
  finalizarViaje,
  puedeOperarViaje,
  pendienteAdministrativo,
  FILTRO_ADMINISTRATIVO_PENDIENTE,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  EstadoNoConfirmableError,
  YaCanceladoError,
  PermisoDenegadoError,
  ViajeEnCursoError,
  ESTADOS_VIAJE_VALIDOS,
};
