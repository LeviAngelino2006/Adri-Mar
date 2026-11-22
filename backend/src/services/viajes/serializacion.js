// Forma de respuesta de un viaje para el front.
const { nombresMarcaModelo } = require('../../utils/marcaModeloVehiculo');
const { puedeVerDatosAdministrativos } = require('./permisos');

// Un punto del recorrido (origen, destino o parada) como lo ve el front: con el
// placeId de Google y las coordenadas (null si no tiene), para que el link
// "Ver recorrido en Google Maps" y el mensaje de WhatsApp lleven al chofer a la
// dirección exacta (utils/googleMaps.urlRecorrido del front).
const serializarPunto = (u) => ({
  id: u.id,
  nombre: u.nombre,
  placeId: u.placeId ?? null,
  latitud: u.latitud ?? null,
  longitud: u.longitud ?? null,
});

// Qué le falta cargar a un viaje en lo administrativo, para el badge del
// listado y el filtro "Administrativo pendiente". Un viaje CANCELADO nunca
// queda pendiente. SIN_PRECIO tiene prioridad sobre COBRO_PENDIENTE: sin precio
// no hay nada que cobrar todavía.
//   SIN_PRECIO       precio sin cargar (cualquier estado salvo CANCELADO)
//   COBRO_PENDIENTE  viaje FINALIZADO con precio cargado y estado de pago del
//                    cliente distinto de PAGADO (incluido "sin definir"). Antes
//                    de finalizar no se marca: que un viaje programado todavía
//                    no esté cobrado es lo normal, no un olvido.
// FILTRO_ADMINISTRATIVO_PENDIENTE es la misma regla escrita como `where` de
// Prisma (para filtrar en la base): si cambia una, cambiar la otra. El test
// "pendientes administrativos" de viajesPendientes.test.js chequea que
// coincidan.
const ESTADO_PAGO_PAGADO = 'PAGADO';

function pendienteAdministrativo(viaje) {
  const estado = viaje.estadoViaje.descripcion;
  if (estado === 'CANCELADO') return null;
  if (viaje.precio == null) return 'SIN_PRECIO';
  if (estado === 'FINALIZADO' && viaje.estadoPagoCliente?.descripcion !== ESTADO_PAGO_PAGADO) {
    return 'COBRO_PENDIENTE';
  }
  return null;
}

// Segunda rama del OR sin `precio: { not: null }`: si el precio es null ya
// entra por la primera (SIN_PRECIO), así que el resultado es el mismo.
const FILTRO_ADMINISTRATIVO_PENDIENTE = {
  estadoViaje: { descripcion: { not: 'CANCELADO' } },
  OR: [
    { precio: null },
    {
      estadoViaje: { descripcion: 'FINALIZADO' },
      OR: [
        { estadoPagoClienteId: null },
        { estadoPagoCliente: { is: { descripcion: { not: ESTADO_PAGO_PAGADO } } } },
      ],
    },
  ],
};

// Datos administrativos de un viaje. Para quien no puede verlos se OMITEN (ver
// serializarViaje), no van en null: un null diría "no se cargó nada" sobre un
// viaje que sí tiene precio, que es falso. Los ids de las relaciones van en el
// mismo grupo porque también revelan el dato. precio/pagoChofer vienen como
// Decimal de Prisma y se convierten a number; lo no cargado va en null.
function serializarDatosAdministrativos(viaje) {
  return {
    pendienteAdministrativo: pendienteAdministrativo(viaje),
    precio: viaje.precio == null ? null : Number(viaje.precio),
    estadoPagoClienteId: viaje.estadoPagoClienteId,
    estadoPagoCliente: viaje.estadoPagoCliente
      ? { id: viaje.estadoPagoCliente.id, descripcion: viaje.estadoPagoCliente.descripcion }
      : null,
    fechaPagoCliente: viaje.fechaPagoCliente,
    metodoPagoClienteId: viaje.metodoPagoClienteId,
    metodoPagoCliente: viaje.metodoPagoCliente
      ? { id: viaje.metodoPagoCliente.id, descripcion: viaje.metodoPagoCliente.descripcion }
      : null,
    pagoChofer: viaje.pagoChofer == null ? null : Number(viaje.pagoChofer),
    estadoPagoChoferId: viaje.estadoPagoChoferId,
    estadoPagoChofer: viaje.estadoPagoChofer
      ? { id: viaje.estadoPagoChofer.id, descripcion: viaje.estadoPagoChofer.descripcion }
      : null,
    fechaPagoChofer: viaje.fechaPagoChofer,
    metodoPagoChoferId: viaje.metodoPagoChoferId,
    metodoPagoChofer: viaje.metodoPagoChofer
      ? { id: viaje.metodoPagoChofer.id, descripcion: viaje.metodoPagoChofer.descripcion }
      : null,
  };
}

function serializarCandidatos(viaje) {
  return {
    choferesCandidatos: (viaje.choferesCandidatos ?? []).map(({ persona }) => ({
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
    })),
    vehiculosCandidatos: (viaje.vehiculosCandidatos ?? []).map(({ vehiculo }) => ({
      id: vehiculo.id,
      dominio: vehiculo.dominio,
      numeroInterno: vehiculo.numeroInterno,
    })),
  };
}

// `km` son las lecturas vigentes INICIO_VIAJE y FIN_VIAJE del viaje, ya
// resueltas por consultas.obtenerKmDeViajes (las columnas
// odometroInicial/odometroFinal de Viaje están deprecadas). Llegan hechas para
// que serializar no consulte la base: el listado las resuelve en lote, sin una
// consulta por viaje. Se devuelven como odometroInicial y odometroFinal (un
// viaje En viaje tiene solo el inicial; uno sin comenzar, ninguno) y
// kmRealizados es null si falta alguna.
function serializarViaje(viaje, usuarioSolicitante, { vigenteInicio = null, vigenteFin = null } = {}) {
  const kmRealizados = vigenteInicio && vigenteFin ? vigenteFin.valorKm - vigenteInicio.valorKm : null;

  const estado = viaje.estadoViaje.descripcion;

  return {
    id: viaje.id,
    // choferId/vehiculoId van en null en un viaje A_CONFIRMAR; nunca se omite
    // la clave.
    choferId: viaje.choferId,
    chofer: viaje.chofer
      ? {
          id: viaje.chofer.id,
          nombre: viaje.chofer.nombre,
          apellido: viaje.chofer.apellido,
          // El teléfono es un dato personal: solo lo ven los gestores, que lo
          // necesitan para avisarle al chofer por WhatsApp. Para el resto la
          // clave se omite (no va en null: null diría "no tiene teléfono"). Mismo
          // criterio que los datos administrativos y los candidatos.
          ...(puedeVerDatosAdministrativos(usuarioSolicitante) ? { telefono: viaje.chofer.telefono ?? null } : {}),
        }
      : null,
    vehiculoId: viaje.vehiculoId,
    vehiculo: viaje.vehiculo
      ? {
          id: viaje.vehiculo.id,
          dominio: viaje.vehiculo.dominio,
          numeroInterno: viaje.vehiculo.numeroInterno,
          ...nombresMarcaModelo(viaje.vehiculo),
          kilometraje: viaje.vehiculo.kilometraje,
        }
      : null,
    // origenId/destinoId van en null en viajes históricos que no los tienen
    // (no se inventa ni se omite la clave).
    origenId: viaje.origenId,
    origen: viaje.origen ? serializarPunto(viaje.origen) : null,
    destinoId: viaje.destinoId,
    destino: viaje.destino ? serializarPunto(viaje.destino) : null,
    // Paradas intermedias, ordenadas. No son un dato administrativo ni de
    // planificación interna: las ven todos los perfiles que ven el viaje.
    paradas: (viaje.paradas ?? []).map((parada) => ({
      orden: parada.orden,
      ubicacion: serializarPunto(parada.ubicacion),
    })),
    // Cliente es un dato core del viaje, visible para todos los perfiles.
    clienteId: viaje.clienteId,
    cliente: viaje.cliente ? { id: viaje.cliente.id, nombre: viaje.cliente.nombre } : null,
    // Datos administrativos: solo Administrador/Encargado; para el resto se
    // omiten las claves (ver serializarDatosAdministrativos).
    ...(puedeVerDatosAdministrativos(usuarioSolicitante) ? serializarDatosAdministrativos(viaje) : {}),
    // Candidatos: mismo criterio que los datos administrativos (solo
    // Administrador/Encargado; para el resto las claves se omiten, no van en
    // []): quién "podría" hacer un viaje es información de planificación que
    // un chofer no tiene por qué ver. Fuera de A_CONFIRMAR van vacíos.
    ...(puedeVerDatosAdministrativos(usuarioSolicitante) ? serializarCandidatos(viaje) : {}),
    fechaInicio: viaje.fechaInicio,
    fechaFin: viaje.fechaFin,
    kilometrosEstimados: viaje.kilometrosEstimados,
    // Dato informativo, no administrativo: lo ven todos los perfiles que ven
    // el viaje. null si no se cargó.
    cantidadPasajeros: viaje.cantidadPasajeros ?? null,
    horaInicioReal: viaje.horaInicioReal,
    horaFinReal: viaje.horaFinReal,
    odometroInicial: vigenteInicio ? vigenteInicio.valorKm : null,
    odometroFinal: vigenteFin ? vigenteFin.valorKm : null,
    kmRealizados,
    // Nota operativa del viaje, cargada solo al finalizar: visible para cualquier
    // perfil que vea el viaje (no es un dato administrativo). null si no hay.
    observacionFinal: viaje.observacionFinal,
    estado,
    creadoEn: viaje.creadoEn,
  };
}

module.exports = {
  pendienteAdministrativo,
  FILTRO_ADMINISTRATIVO_PENDIENTE,
  serializarViaje,
};
