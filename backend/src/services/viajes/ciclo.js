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

// Solo tiene sentido sobre un viaje A_CONFIRMAR (si no, 409). Combina lo que
// el viaje ya tenía guardado con lo que venga en el payload (el payload gana
// campo por campo, si está presente) y exige que el resultado tenga los 5
// completos — si no, 400 nombrando cuáles faltan, mismos mensajes que
// editar en modo obligatorio. Como un A_CONFIRMAR no tiene asignado,
// choferId/vehiculoId tienen que venir en el payload: pueden ser o no
// candidatos ("elegir otro" está permitido). Con los 5 completos corre la
// MISMA validación de negocio que actualizarViaje sobre un PROGRAMADO
// (validarDisponibilidadOperativa — no se duplica) y, si pasa, pasa a
// PROGRAMADO y borra los candidatos, todo en una transacción.
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
    // updateMany condicional contra el estado de origen (mismo patrón que
    // comenzarViaje): si dos confirmaciones del MISMO viaje llegan a la vez, el
    // chequeo de estado de arriba pudo leer A_CONFIRMAR en las dos. El WHERE
    // por estado es la garantía dura — la segunda encuentra count 0.
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
    // El error se lanza ACÁ, antes de los deleteMany: la confirmación perdedora
    // no tiene que borrar los candidatos (ya los borró la ganadora) ni dejar
    // nada hecho a medias.
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
  // Mismo criterio que actualizarViaje: un viaje A_CONFIRMAR todavía es una
  // etapa de planificación, así que también se puede cancelar sin haber
  // llegado a completarse.
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

// Si crearLectura (dentro de la transacción) rechaza el valor, llega acá como
// lecturaOdometroService.ValidacionError — se relanza como
// viajeService.ValidacionError para que el controller tenga un solo tipo de
// error de validación que reconocer, sin tener que importar el service de
// lecturas solo para ese instanceof.
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

  // Revalida habilitación de chofer/vehículo con las mismas funciones que ya
  // usa el alta (validarChofer/validarVehiculo más arriba en este archivo) —
  // nada nuevo, solo se reusan tal cual, sin duplicar sus reglas.
  await validarChofer(actual.choferId);
  await validarVehiculo(actual.vehiculoId);

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');
  const estadoEnViaje = await obtenerEstadoViajePorDescripcion('EN_VIAJE');

  // Chequeo explícito para un mensaje claro en el camino feliz. La garantía
  // dura contra la carrera entre dos requests simultáneos para el MISMO
  // vehículo/chofer en DOS VIAJES DISTINTOS es el índice único parcial de la
  // base (ver catch de P2002 más abajo). Para la carrera de dos requests
  // sobre el MISMO viaje (dos comenzar simultáneos), la garantía dura es el
  // updateMany condicional de más abajo.
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
      // updateMany condicional contra el estado de origen esperado, en vez de
      // un update ciego: si dos requests llegan a comenzar ESTE MISMO viaje a
      // la vez, el chequeo de arriba (`actual.estadoViaje.descripcion`) pudo
      // haber leído PROGRAMADO en ambas, antes de que ninguna escribiera
      // todavía. Este WHERE con el estado de origen es la garantía dura: la
      // segunda transacción en llegar ya no va a encontrar el viaje en
      // PROGRAMADO (la primera ya lo cambió) y count da 0.
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

      // { cliente: tx }: crearLectura NO debe abrir su propia transacción acá
      // (abriría una segunda, con el `prisma` global, y quedaría esperando el
      // lock de fila que esta misma transacción ya tiene tomado — el
      // auto-deadlock documentado en el Paso 3).
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

// PASO 6 — la equivalencia documentada acá se rompió, y esta función ya
// valida explícitamente contra la lectura INICIO_VIAJE vigente de este
// viaje, además de lo que ya valida crearLectura. El motivo concreto:
// crearLectura determina "la última lectura del vehículo" con un
// findFirst(orderBy fechaHora desc) crudo sobre TODA la tabla, no contra
// vehiculo.kilometraje (el caché, que sí se mantiene de forma confiable).
// Una corrección (Paso 6) siempre se inserta con fechaHora = now(), que es
// mayor a la fechaHora de CUALQUIER lectura previa — incluida la propia
// INICIO_VIAJE de un viaje que sigue EN_VIAJE. Si un Administrador corrige
// una lectura VIEJA del vehículo (no la INICIO_VIAJE de este viaje, sino una
// anterior, p.ej. el ALTA_VEHICULO) con un valor menor al de la propia
// INICIO_VIAJE, esa corrección pasa a ser, por fechaHora cruda, "la lectura
// más reciente" — aunque el caché (vehiculo.kilometraje) no cambió, porque
// esa lectura corregida SÍ tenía una posterior (la INICIO_VIAJE) y por regla
// de corregirLectura el caché no se toca en ese caso. Resultado: crearLectura
// validaría el odómetro final contra ese valor viejo y más chico, no contra
// el valor real de inicio de este viaje — dejando pasar un odómetro final
// menor al de inicio. Por eso se agrega acá el chequeo explícito contra
// obtenerLecturaVigente(lecturaInicio), que sí resuelve correctamente el
// valor vigente de ESTE viaje puntual sin importar qué más se haya corregido
// en el medio.
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
      // Mismo patrón que comenzarViaje: updateMany condicional contra el
      // estado de origen esperado (EN_VIAJE), para que dos finalizar
      // simultáneos sobre el MISMO viaje no generen dos lecturas FIN_VIAJE —
      // el segundo en llegar encuentra count=0 y aborta sin crear nada.
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
