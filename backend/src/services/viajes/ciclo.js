// Cambios de estado del viaje: confirmar, cancelar, comenzar y finalizar.
const prisma = require('../prismaClient');
const lecturaOdometroService = require('../lecturaOdometroService');
const {
  PermisoDenegadoError,
  ViajeEnCursoError,
  ValidacionError,
  EstadoNoEditableError,
  YaCanceladoError,
  EstadoNoConfirmableError,
} = require('./errores');
const { esElChoferDelViaje, puedeOperarViaje } = require('./permisos');
const {
  obtenerEstadoViajePorDescripcion,
  validarChofer,
  validarVehiculo,
  validarYArmarOperativos,
  presente,
} = require('./validaciones');
const { INCLUDE_RELACIONES_VIAJE, obtenerViaje } = require('./consultas');
const { serializarViaje } = require('./serializacion');

// Textos del 409 de comenzar. `carrera` es el del índice único: no se sabe
// cuál de los dos chocó.
const MENSAJES_VIAJE_EN_CURSO = {
  propio: 'Ya tenés un viaje en curso. Finalizalo para comenzar otro.',
  chofer: 'Este chofer ya tiene un viaje en curso. Tiene que finalizarlo para comenzar otro.',
  vehiculo: 'Este vehículo ya está en otro viaje en curso.',
  carrera: 'El vehículo o el chofer ya están en otro viaje en curso.',
};

// Solo sobre un viaje A_CONFIRMAR (si no, 409). Combina lo guardado con el
// payload (el payload gana campo por campo) y exige los 5 campos operativos
// completos. Como un A_CONFIRMAR no tiene asignado, choferId/vehiculoId vienen
// en el payload y pueden no ser candidatos ("elegir otro" está permitido).
// Corre la misma validación de negocio que editar un PROGRAMADO.
async function confirmarViaje(id, payload = {}, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion !== 'A_CONFIRMAR') {
    throw new EstadoNoConfirmableError(actual.estadoViaje.descripcion);
  }

  const combinar = (campo) => (presente(payload, campo) ? payload[campo] : actual[campo]);

  const operativos = await validarYArmarOperativos(
    {
      choferId: combinar('choferId'),
      vehiculoId: combinar('vehiculoId'),
      fechaInicio: combinar('fechaInicio'),
      fechaFin: combinar('fechaFin'),
      kilometrosEstimados: combinar('kilometrosEstimados'),
    },
    { obligatorios: true, excluirViajeId: actual.id }
  );

  const estadoAConfirmar = await obtenerEstadoViajePorDescripcion('A_CONFIRMAR');
  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  // Pasar a PROGRAMADO y borrar los candidatos son UNA sola transacción: los
  // candidatos no se guardan una vez confirmado (decisión de negocio), y un
  // viaje PROGRAMADO que conserva candidatos (o uno A_CONFIRMAR sin ellos) sería
  // un estado inconsistente.
  await prisma.$transaction(async (tx) => {
    // updateMany condicional contra el estado de origen: si dos confirmaciones
    // del MISMO viaje llegan a la vez, las dos pudieron leer A_CONFIRMAR. El
    // WHERE por estado es la garantía dura: la segunda encuentra count 0.
    const actualizados = await tx.viaje.updateMany({
      where: { id: actual.id, estadoViajeId: estadoAConfirmar.id },
      data: {
        choferId: operativos.choferId,
        vehiculoId: operativos.vehiculoId,
        fechaInicio: operativos.fechaInicio,
        fechaFin: operativos.fechaFin,
        kilometrosEstimados: operativos.kilometrosEstimados,
        estadoViajeId: estadoProgramado.id,
      },
    });
    // Se lanza antes de los deleteMany: la confirmación perdedora no tiene que
    // borrar nada ni dejar cambios a medias.
    if (actualizados.count === 0) {
      const viajeActual = await tx.viaje.findUnique({
        where: { id: actual.id },
        include: { estadoViaje: true },
      });
      throw new EstadoNoConfirmableError(viajeActual.estadoViaje.descripcion);
    }

    await tx.viajeChoferCandidato.deleteMany({ where: { viajeId: actual.id } });
    await tx.viajeVehiculoCandidato.deleteMany({ where: { viajeId: actual.id } });
  });

  const viaje = await obtenerViaje(actual.id);
  return await serializarViaje(viaje, usuarioSolicitante);
}

async function cancelarViaje(id, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion === 'CANCELADO') {
    throw new YaCanceladoError();
  }
  // Un A_CONFIRMAR todavía es planificación: también se puede cancelar.
  if (!['PROGRAMADO', 'A_CONFIRMAR'].includes(actual.estadoViaje.descripcion)) {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const estadoCancelado = await obtenerEstadoViajePorDescripcion('CANCELADO');

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: { estadoViajeId: estadoCancelado.id },
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return await serializarViaje(viaje, usuarioSolicitante);
}

// Si crearLectura rechaza el valor, su ValidacionError se relanza como la de
// viajes: así el controller reconoce un solo tipo de error de validación sin
// importar el service de lecturas.
function relanzarComoValidacionDeViaje(err) {
  if (err instanceof lecturaOdometroService.ValidacionError) {
    throw new ValidacionError(err.errores);
  }
  throw err;
}

async function comenzarViaje(id, { odometroInicial }, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (!puedeOperarViaje(usuarioSolicitante, actual)) {
    throw new PermisoDenegadoError();
  }
  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  // Revalida la habilitación: pudo cambiar desde que se programó el viaje.
  await validarChofer(actual.choferId);
  await validarVehiculo(actual.vehiculoId);

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');
  const estadoEnViaje = await obtenerEstadoViajePorDescripcion('EN_VIAJE');

  // Chequeo para un mensaje claro en el camino feliz. La garantía dura contra
  // dos requests simultáneos para el MISMO vehículo/chofer en DOS viajes es el
  // índice único parcial de la base (catch de P2002). Para dos comenzar sobre
  // el MISMO viaje, es el updateMany condicional de la transacción.
  const vehiculoEnViaje = await prisma.viaje.findFirst({
    where: { vehiculoId: actual.vehiculoId, estadoViajeId: estadoEnViaje.id },
  });
  if (vehiculoEnViaje) {
    throw new ViajeEnCursoError(MENSAJES_VIAJE_EN_CURSO.vehiculo);
  }
  const choferEnViaje = await prisma.viaje.findFirst({
    where: { choferId: actual.choferId, estadoViajeId: estadoEnViaje.id },
  });
  if (choferEnViaje) {
    // Lo normal es que comience el propio chofer; si es un gestor, el mensaje
    // no puede hablarle de "tu" viaje.
    throw new ViajeEnCursoError(
      esElChoferDelViaje(usuarioSolicitante, actual) ? MENSAJES_VIAJE_EN_CURSO.propio : MENSAJES_VIAJE_EN_CURSO.chofer
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // updateMany condicional contra el estado de origen, no un update ciego:
      // si dos requests comienzan ESTE viaje a la vez, las dos pudieron leer
      // PROGRAMADO. Con este WHERE la segunda encuentra count 0.
      const actualizados = await tx.viaje.updateMany({
        where: { id: actual.id, estadoViajeId: estadoProgramado.id },
        data: { estadoViajeId: estadoEnViaje.id, horaInicioReal: new Date() },
      });
      if (actualizados.count === 0) {
        const viajeActual = await tx.viaje.findUnique({
          where: { id: actual.id },
          include: { estadoViaje: true },
        });
        throw new EstadoNoEditableError(viajeActual.estadoViaje.descripcion);
      }

      // { cliente: tx }: crearLectura no debe abrir su propia transacción con el
      // `prisma` global: quedaría esperando el lock de fila que esta misma
      // transacción ya tiene tomado (auto-deadlock).
      await lecturaOdometroService.crearLectura(
        {
          vehiculoId: actual.vehiculoId,
          valorKm: odometroInicial,
          origen: 'INICIO_VIAJE',
          viajeId: actual.id,
          usuarioId: usuarioSolicitante.id,
        },
        { cliente: tx }
      );
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ViajeEnCursoError(MENSAJES_VIAJE_EN_CURSO.carrera);
    }
    relanzarComoValidacionDeViaje(err);
  }

  const viajeFinal = await obtenerViaje(actual.id);
  return await serializarViaje(viajeFinal, usuarioSolicitante);
}

// ~150-200 palabras: de sobra para una nota sobre cómo fue el viaje (un
// comportamiento a destacar, una incidencia), y suficientemente acotado para
// que no sirva para volcar texto arbitrario. Cuenta caracteres (no unidades
// UTF-16), así que un emoji vale 1 como lo ve quien escribe. El frontend
// repite este número en el maxLength del campo (ModalOdometroViaje).
const MAX_LONGITUD_OBSERVACION = 1000;

// La observación es opcional: ausente, null, vacía o solo espacios → null (el
// viaje se finaliza sin nota, nunca se guarda un string vacío). Si viene, tiene
// que ser un string y no pasar el máximo; se guarda sin espacios en los
// extremos.
function validarObservacionFinal(observacion) {
  if (observacion === undefined || observacion === null) return null;

  if (typeof observacion !== 'string') {
    throw new ValidacionError({ observacion: 'La observación debe ser un texto' });
  }

  const texto = observacion.trim();
  if (texto === '') return null;

  if ([...texto].length > MAX_LONGITUD_OBSERVACION) {
    throw new ValidacionError({
      observacion: `La observación no puede superar los ${MAX_LONGITUD_OBSERVACION} caracteres`,
    });
  }

  return texto;
}

async function finalizarViaje(id, { odometroFinal, observacion }, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  if (!puedeOperarViaje(usuarioSolicitante, actual)) {
    throw new PermisoDenegadoError();
  }
  if (actual.estadoViaje.descripcion !== 'EN_VIAJE') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const observacionFinal = validarObservacionFinal(observacion);

  // Chequeo explícito contra la lectura INICIO_VIAJE vigente, además del de
  // crearLectura: crearLectura compara contra la lectura con fechaHora más
  // reciente del vehículo, y una corrección se inserta con fechaHora = now().
  // Si un Administrador corrige una lectura anterior (p. ej. ALTA_VEHICULO)
  // con un valor menor al de inicio, esa corrección pasa a ser "la última" y
  // crearLectura dejaría pasar un odómetro final menor al de inicio.
  // obtenerLecturaVigente resuelve el valor de inicio de ESTE viaje.
  const lecturaInicio = await prisma.lecturaOdometro.findFirst({
    where: { viajeId: actual.id, origen: { descripcion: 'INICIO_VIAJE' } },
  });
  if (lecturaInicio) {
    const vigenteInicio = await lecturaOdometroService.obtenerLecturaVigente(lecturaInicio.id);
    const odometroFinalNumero = Number(odometroFinal);
    if (Number.isInteger(odometroFinalNumero) && odometroFinalNumero < vigenteInicio.valorKm) {
      throw new ValidacionError({
        odometroFinal: `El odómetro final no puede ser menor a la lectura de inicio de este viaje (${vigenteInicio.valorKm} km)`,
      });
    }
  }

  const estadoEnViajeOrigen = await obtenerEstadoViajePorDescripcion('EN_VIAJE');
  const estadoFinalizado = await obtenerEstadoViajePorDescripcion('FINALIZADO');

  try {
    await prisma.$transaction(async (tx) => {
      // updateMany condicional contra EN_VIAJE: dos finalizar simultáneos
      // sobre el MISMO viaje no generan dos lecturas FIN_VIAJE (el segundo
      // encuentra count 0 y aborta sin crear nada).
      const actualizados = await tx.viaje.updateMany({
        where: { id: actual.id, estadoViajeId: estadoEnViajeOrigen.id },
        data: { estadoViajeId: estadoFinalizado.id, horaFinReal: new Date(), observacionFinal },
      });
      if (actualizados.count === 0) {
        const viajeActual = await tx.viaje.findUnique({
          where: { id: actual.id },
          include: { estadoViaje: true },
        });
        throw new EstadoNoEditableError(viajeActual.estadoViaje.descripcion);
      }

      await lecturaOdometroService.crearLectura(
        {
          vehiculoId: actual.vehiculoId,
          valorKm: odometroFinal,
          origen: 'FIN_VIAJE',
          viajeId: actual.id,
          usuarioId: usuarioSolicitante.id,
        },
        { cliente: tx }
      );
    });
  } catch (err) {
    relanzarComoValidacionDeViaje(err);
  }

  const viajeFinal = await obtenerViaje(actual.id);
  return await serializarViaje(viajeFinal, usuarioSolicitante);
}

module.exports = {
  confirmarViaje,
  cancelarViaje,
  comenzarViaje,
  finalizarViaje,
};
