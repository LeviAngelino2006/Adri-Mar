const prisma = require('./prismaClient');
const { validarFormatoParadas } = require('../utils/recorridoViaje');
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
const {
  validarCantidadPasajeros,
  obtenerEstadoViajePorDescripcion,
  validarYArmarCore,
  validarYArmarOperativos,
  validarExistenciaParadas,
  reemplazarParadas,
  validarParadasDelRecorrido,
  validarFormatoCandidatos,
  validarExistenciaCandidatos,
  erroresCandidatosAConfirmar,
} = require('./viajes/validaciones');
const {
  INCLUDE_RELACIONES_VIAJE,
  pendienteAdministrativo,
  FILTRO_ADMINISTRATIVO_PENDIENTE,
  serializarViaje,
  obtenerViaje,
} = require('./viajes/serializacion');
const { disponibilidadDeViaje, disponibilidadParaAlta } = require('./viajes/disponibilidad');
const {
  listarEstadosPago,
  listarMetodosPago,
  actualizarDatosAdministrativos,
} = require('./viajes/datosAdministrativos');
const { confirmarViaje, cancelarViaje, comenzarViaje, finalizarViaje } = require('./viajes/ciclo');
const { ESTADOS_VIAJE_VALIDOS, listarViajes } = require('./viajes/listado');

// Todo viaje nace A_CONFIRMAR, vengan o no los 5 campos operativos: el
// encargado primero anota el viaje y recién después lo confirma. El único
// camino a PROGRAMADO es `confirmarViaje`, que es donde corre la validación de
// disponibilidad (habilitación + solapamiento). choferId/vehiculoId quedan en
// null: en su lugar van las listas de candidatos (choferesCandidatos /
// vehiculosCandidatos). clienteId/origenId/destinoId y fechaInicio son siempre
// obligatorios.
//
// El alta es solo operativa: los datos administrativos (precio, pagos) se
// cargan después, únicamente por PATCH /:id/datos-administrativos. Si un
// cliente todavía manda `datosAdministrativos` se rechaza con 400 en vez de
// ignorarlo, para que lo tipeado no se pierda en silencio.
async function crearViaje(
  {
    choferId,
    vehiculoId,
    fechaInicio,
    fechaFin,
    kilometrosEstimados,
    cantidadPasajeros,
    choferesCandidatos,
    vehiculosCandidatos,
    paradas: paradasPayload,
    clienteId,
    origenId,
    destinoId,
    datosAdministrativos,
  },
  usuarioSolicitante
) {
  if (datosAdministrativos !== undefined) {
    throw new ValidacionError({
      datosAdministrativos: 'Los datos administrativos se cargan desde la ficha del viaje, no en el alta',
    });
  }

  const formatoParadas = validarFormatoParadas(paradasPayload);
  const core = await validarYArmarCore({ clienteId, origenId, destinoId }, { hayParadas: formatoParadas.ids.length > 0 });
  const paradas = validarParadasDelRecorrido(formatoParadas, core);

  const pasajeros = validarCantidadPasajeros(cantidadPasajeros);
  const candidatos = validarFormatoCandidatos({ choferesCandidatos, vehiculosCandidatos });
  // choferId/vehiculoId no se pasan a validarYArmarOperativos: en A_CONFIRMAR
  // el asignado es siempre null (si vinieron, ya son un error previo).
  const operativos = await validarYArmarOperativos(
    { fechaInicio, fechaFin, kilometrosEstimados },
    {
      obligatorios: false,
      erroresPrevios: {
        ...pasajeros.errores,
        ...erroresCandidatosAConfirmar({ choferId, vehiculoId }, candidatos),
        ...paradas.errores,
      },
    }
  );
  await validarExistenciaCandidatos(candidatos);
  await validarExistenciaParadas(paradas.ids);

  const estado = await obtenerEstadoViajePorDescripcion('A_CONFIRMAR');

  const viaje = await prisma.viaje.create({
    data: {
      choferId: operativos.choferId,
      vehiculoId: operativos.vehiculoId,
      fechaInicio: operativos.fechaInicio,
      fechaFin: operativos.fechaFin,
      kilometrosEstimados: operativos.kilometrosEstimados,
      cantidadPasajeros: pasajeros.valor,
      clienteId: core.clienteId,
      origenId: core.origenId,
      destinoId: core.destinoId,
      estadoViajeId: estado.id,
      // Create anidado: Prisma lo ejecuta en una sola transacción, así el
      // viaje se crea con sus candidatos o no se crea.
      choferesCandidatos: { create: candidatos.choferes.map((personaId) => ({ personaId })) },
      vehiculosCandidatos: { create: candidatos.vehiculos.map((vehiculoId) => ({ vehiculoId })) },
      paradas: { create: paradas.ids.map((ubicacionId, indice) => ({ ubicacionId, orden: indice + 1 })) },
    },
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return await serializarViaje(viaje, usuarioSolicitante);
}

// Sigue siendo reemplazo completo (no parcial, a diferencia de
// datos-administrativos): un campo operativo que no venga en el payload se
// BORRA (null), no se conserva el valor anterior — eso es justamente lo que
// hace validarYArmarOperativos en modo no-obligatorio.
//
// La obligatoriedad de los 5 depende del ESTADO ACTUAL del viaje, no de
// cuántos vengan en el payload (a diferencia de crearViaje): un viaje
// PROGRAMADO siempre tiene los 5, así que editarlo exige los 5 de nuevo
// (igual que siempre); un viaje A_CONFIRMAR los tiene opcionales. Esta
// función nunca cambia el estado — ni siquiera si el payload termina
// completando los 5 campos de un A_CONFIRMAR; esa transición es exclusiva de
// `confirmarViaje`, a propósito, para no tener dos caminos que promuevan un
// viaje.
//
// Según el estado actual el viaje se asigna de una de dos maneras:
//  - PROGRAMADO: 1 chofer y 1 vehículo, validación completa. Los candidatos no
//    aplican (si vienen no vacíos, 400).
//  - A_CONFIRMAR: choferId/vehiculoId sueltos no se aceptan (400); se usan las
//    listas de candidatos, que se REEMPLAZAN por completo (deleteMany +
//    createMany) junto con el update del viaje, todo en una transacción.
//
// Las paradas se editan en los dos estados, también como reemplazo completo en
// la misma transacción que el update (un PUT sin `paradas` las borra, como
// cualquier otro campo ausente). En EN_VIAJE, FINALIZADO o CANCELADO no se
// puede editar nada (EstadoNoEditableError, más arriba).
async function actualizarViaje(
  id,
  {
    choferId,
    vehiculoId,
    fechaInicio,
    fechaFin,
    kilometrosEstimados,
    cantidadPasajeros,
    choferesCandidatos,
    vehiculosCandidatos,
    paradas: paradasPayload,
    clienteId,
    origenId,
    destinoId,
  },
  usuarioSolicitante
) {
  const actual = await obtenerViaje(id);
  const estadoActual = actual.estadoViaje.descripcion;

  if (estadoActual !== 'PROGRAMADO' && estadoActual !== 'A_CONFIRMAR') {
    throw new EstadoNoEditableError(estadoActual);
  }

  const formatoParadas = validarFormatoParadas(paradasPayload);
  const core = await validarYArmarCore({ clienteId, origenId, destinoId }, { hayParadas: formatoParadas.ids.length > 0 });
  const paradas = validarParadasDelRecorrido(formatoParadas, core);

  const modoCompleto = estadoActual === 'PROGRAMADO';
  const pasajeros = validarCantidadPasajeros(cantidadPasajeros);
  const candidatos = validarFormatoCandidatos({ choferesCandidatos, vehiculosCandidatos });

  const datosViaje = {
    cantidadPasajeros: pasajeros.valor,
    clienteId: core.clienteId,
    origenId: core.origenId,
    destinoId: core.destinoId,
  };

  if (modoCompleto) {
    const erroresPrevios = { ...pasajeros.errores, ...candidatos.errores, ...paradas.errores };
    if (candidatos.choferes.length > 0) {
      erroresPrevios.choferesCandidatos = 'Los candidatos solo aplican a viajes A confirmar';
    }
    if (candidatos.vehiculos.length > 0) {
      erroresPrevios.vehiculosCandidatos = 'Los candidatos solo aplican a viajes A confirmar';
    }

    const operativos = await validarYArmarOperativos(
      { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
      { obligatorios: true, excluirViajeId: actual.id, erroresPrevios }
    );
    await validarExistenciaParadas(paradas.ids);

    const viaje = await prisma.$transaction(async (tx) => {
      await reemplazarParadas(tx, actual.id, paradas.ids);
      return tx.viaje.update({
        where: { id: actual.id },
        data: { ...datosViaje, ...operativos },
        include: INCLUDE_RELACIONES_VIAJE,
      });
    });

    return await serializarViaje(viaje, usuarioSolicitante);
  }

  const operativos = await validarYArmarOperativos(
    { fechaInicio, fechaFin, kilometrosEstimados },
    {
      obligatorios: false,
      excluirViajeId: actual.id,
      erroresPrevios: {
        ...pasajeros.errores,
        ...erroresCandidatosAConfirmar({ choferId, vehiculoId }, candidatos),
        ...paradas.errores,
      },
    }
  );
  await validarExistenciaCandidatos(candidatos);
  await validarExistenciaParadas(paradas.ids);

  const viaje = await prisma.$transaction(async (tx) => {
    // Reemplazo completo de las listas (candidatos y paradas) + update del
    // viaje: si cualquier paso falla no queda el viaje a medio cambiar.
    await reemplazarParadas(tx, actual.id, paradas.ids);
    await tx.viajeChoferCandidato.deleteMany({ where: { viajeId: actual.id } });
    await tx.viajeVehiculoCandidato.deleteMany({ where: { viajeId: actual.id } });
    if (candidatos.choferes.length > 0) {
      await tx.viajeChoferCandidato.createMany({
        data: candidatos.choferes.map((personaId) => ({ viajeId: actual.id, personaId })),
      });
    }
    if (candidatos.vehiculos.length > 0) {
      await tx.viajeVehiculoCandidato.createMany({
        data: candidatos.vehiculos.map((vehiculoId) => ({ viajeId: actual.id, vehiculoId })),
      });
    }

    return tx.viaje.update({
      where: { id: actual.id },
      data: { ...datosViaje, ...operativos },
      include: INCLUDE_RELACIONES_VIAJE,
    });
  });

  return await serializarViaje(viaje, usuarioSolicitante);
}

module.exports = {
  crearViaje,
  listarViajes,
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
