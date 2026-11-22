// Forma de respuesta de un viaje para el front.
const prisma = require('../prismaClient');
const lecturaOdometroService = require('../lecturaOdometroService');
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

// Las 12 claves de datos administrativos de un viaje. Se OMITEN por completo
// (en vez de devolverse en null) para quien no puede verlas: un null diría
// "no se cargó nada" sobre un viaje que sí tiene precio cargado, que es un dato
// falso; ausente dice "esto no te corresponde". Los ids de las relaciones
// (estadoPagoClienteId, etc.) van en el mismo grupo porque también revelan el
// dato. precio/pagoChofer vienen de Prisma como Decimal (objeto), se convierten
// a number para que la API devuelva un número plano; las que no se cargaron
// van en null, nunca se omite la clave para un Administrador/Encargado.
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

// kmRealizados ya no sale de columnas propias del viaje (odometroInicial/
// odometroFinal quedaron deprecadas en el Paso 1): se busca la lectura
// INICIO_VIAJE y la FIN_VIAJE asociadas a este viaje y se resuelve cada una
// con obtenerLecturaVigente, por si alguna fue corregida después (todavía no
// hay forma de corregir desde HTTP, pero la función ya existe y el cálculo
// tiene que estar bien desde ya). Si falta cualquiera de las dos, null.
//
// Esas mismas lecturas vigentes se devuelven como odometroInicial y
// odometroFinal (solo lectura, mismo criterio de visibilidad que kmRealizados):
// un viaje En viaje tiene solo el inicial; uno sin comenzar, ninguno (null).
async function serializarViaje(viaje, usuarioSolicitante) {
  const [lecturaInicio, lecturaFin] = await Promise.all([
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'INICIO_VIAJE' } },
    }),
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'FIN_VIAJE' } },
    }),
  ]);

  const [vigenteInicio, vigenteFin] = await Promise.all([
    lecturaInicio ? lecturaOdometroService.obtenerLecturaVigente(lecturaInicio.id) : null,
    lecturaFin ? lecturaOdometroService.obtenerLecturaVigente(lecturaFin.id) : null,
  ]);

  const kmRealizados = vigenteInicio && vigenteFin ? vigenteFin.valorKm - vigenteInicio.valorKm : null;

  const estado = viaje.estadoViaje.descripcion;

  return {
    id: viaje.id,
    // choferId/vehiculoId pueden ser null en un viaje A_CONFIRMAR todavía sin
    // completar — mismo criterio que origen/destino: null, nunca se omite la
    // clave (antes de esta tarea eran siempre no-nulos, así que esto no
    // rompe nada existente, solo agrega el caso nuevo).
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
    // origenId/destinoId y sus objetos resueltos van en null para viajes
    // históricos que no los tienen (no se inventa ni se omite la clave, ver
    // tarea de Origen/Destino).
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
    // Datos administrativos: para Administrador/Encargado van las 12 claves
    // (los 8 campos más los id de las 4 relaciones); para el resto de los
    // perfiles NO viaja ninguna (se omiten, no se devuelven en null — ver
    // serializarDatosAdministrativos).
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
