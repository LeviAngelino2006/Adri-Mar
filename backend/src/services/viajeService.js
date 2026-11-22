const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');
const documentoService = require('./documentoService');
const { campoAusente, validarFormatoParadas } = require('../utils/recorridoViaje');
// Fechas sin offset = hora de Córdoba (UTC-3 todo el año): ver utils/fechaCordoba.
const { aFechaCordoba } = require('../utils/fechaCordoba');
const { normalizarNombre } = require('../utils/normalizarNombre');
const {
  PermisoDenegadoError,
  ViajeEnCursoError,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  YaCanceladoError,
  EstadoNoConfirmableError,
} = require('./viajes/errores');
const { esElChoferDelViaje, puedeOperarViaje, puedeVerDatosAdministrativos } = require('./viajes/permisos');
const {
  aFechaCordobaOInstancia,
  validarCantidadPasajeros,
  obtenerEstadoViajePorDescripcion,
  PROBLEMA_CHOFER,
  problemaDeChofer,
  problemaDeVehiculo,
  validarChofer,
  validarVehiculo,
  buscarSolapamiento,
  validarYArmarCore,
  validarYArmarOperativos,
  validarExistenciaParadas,
  reemplazarParadas,
  validarParadasDelRecorrido,
  validarFormatoListaIds,
  validarFormatoCandidatos,
  validarExistenciaCandidatos,
  erroresCandidatosAConfirmar,
  presente,
} = require('./viajes/validaciones');
const {
  INCLUDE_RELACIONES_VIAJE,
  pendienteAdministrativo,
  FILTRO_ADMINISTRATIVO_PENDIENTE,
  serializarViaje,
  obtenerViaje,
} = require('./viajes/serializacion');

const ESTADOS_VIAJE_VALIDOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Textos del 409 de comenzar. `carrera` es el del índice único: no se sabe
// cuál de los dos chocó.
const MENSAJES_VIAJE_EN_CURSO = {
  propio: 'Ya tenés un viaje en curso. Finalizalo para comenzar otro.',
  chofer: 'Este chofer ya tiene un viaje en curso. Tiene que finalizarlo para comenzar otro.',
  vehiculo: 'Este vehículo ya está en otro viaje en curso.',
  carrera: 'El vehículo o el chofer ya están en otro viaje en curso.',
};

async function validarEstadoPago(id, campo) {
  const estadoPago = await prisma.estadoPago.findUnique({ where: { id } });
  if (!estadoPago) {
    throw new ValidacionError({ [campo]: 'El estado de pago elegido no es válido' });
  }
  return estadoPago;
}

// Orden por id = orden del seed (PENDIENTE/PAGADO/PARCIAL, EFECTIVO/BANCO/CHEQUE),
// que ya es el orden natural para mostrarlos en un <select>.
async function listarEstadosPago() {
  return prisma.estadoPago.findMany({ orderBy: { id: 'asc' } });
}

async function listarMetodosPago() {
  return prisma.metodoPago.findMany({ orderBy: { id: 'asc' } });
}

async function validarMetodoPago(id, campo) {
  const metodoPago = await prisma.metodoPago.findUnique({ where: { id } });
  if (!metodoPago) {
    throw new ValidacionError({ [campo]: 'El método de pago elegido no es válido' });
  }
  return metodoPago;
}

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

// --- Disponibilidad ---------------------------------------------------------
//
// Informa, para una ventana de tiempo, si cada chofer/vehículo está disponible
// y por qué no. Es informativa: nunca bloquea un guardado (al confirmar, la
// validación que cuenta sigue siendo validarDisponibilidadOperativa). Reusa las
// mismas piezas que esa validación — problemaDeChofer/problemaDeVehiculo para
// la habilitación y buscarSolapamiento para el horario — así que las reglas
// no se duplican.

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;
const FORMATO_HORA_CORDOBA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Sin fechaFin (todavía no se sabe cuándo termina) se chequea contra el día
// completo de fechaInicio, de 00:00 a 24:00 hora de Córdoba.
function rangoDelDiaCordoba(fecha) {
  const diaCordoba = new Date(fecha.getTime() - CORDOBA_OFFSET_MS).toISOString().slice(0, 10);
  const inicio = aFechaCordoba(`${diaCordoba}T00:00`);
  return { inicio, fin: new Date(inicio.getTime() + MS_POR_DIA) };
}

function motivoDeChofer(chofer) {
  const problema = problemaDeChofer(chofer);
  if (problema === PROBLEMA_CHOFER.INACTIVO) return 'Dado de baja';
  if (problema === PROBLEMA_CHOFER.NO_HABILITADO) return 'No habilitado para conducir';
  return null;
}

function motivoDeVehiculo(vehiculo) {
  const problema = problemaDeVehiculo(vehiculo);
  if (!problema) return null;
  if (problema === 'EN_TALLER') return 'Vehículo en taller';
  if (problema === 'DADO_DE_BAJA') return 'Vehículo dado de baja';
  return 'Vehículo no operativo';
}

async function calcularDisponibilidad({ fechaInicio, fechaFin, choferIds, vehiculoIds, excluirViajeId }) {
  const ventana = fechaFin ? { inicio: fechaInicio, fin: fechaFin } : rangoDelDiaCordoba(fechaInicio);
  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const [personas, vehiculos, docsChoferes, docsVehiculos] = await Promise.all([
    choferIds.length > 0
      ? prisma.persona.findMany({ where: { id: { in: choferIds } } })
      : [],
    vehiculoIds.length > 0
      ? prisma.vehiculo.findMany({ where: { id: { in: vehiculoIds } }, include: { estadoVehiculo: true } })
      : [],
    choferIds.length > 0
      ? documentoService.evaluarDocumentacionTitulares({
          categoria: 'CHOFER',
          ids: choferIds,
          fechaInicio: ventana.inicio,
          fechaFin: ventana.fin,
        })
      : {},
    vehiculoIds.length > 0
      ? documentoService.evaluarDocumentacionTitulares({
          categoria: 'VEHICULO',
          ids: vehiculoIds,
          fechaInicio: ventana.inicio,
          fechaFin: ventana.fin,
        })
      : {},
  ]);

  async function evaluar({ id, entidad, campo, motivoDeHabilitacion, estadoDoc }) {
    if (!entidad) return { id, disponible: false, motivo: 'No encontrado' };

    const motivoHabilitacion = motivoDeHabilitacion(entidad);
    if (motivoHabilitacion) return { id, disponible: false, motivo: motivoHabilitacion };

    if (estadoDoc?.tieneVencidos) {
      return { id, disponible: false, motivo: estadoDoc.motivo };
    }

    const conflicto = await buscarSolapamiento({
      campo,
      id,
      fechaInicio: ventana.inicio,
      fechaFin: ventana.fin,
      excluirViajeId,
      estadoProgramadoId: estadoProgramado.id,
    });
    if (conflicto) {
      const horario = `${FORMATO_HORA_CORDOBA.format(conflicto.fechaInicio)}–${FORMATO_HORA_CORDOBA.format(conflicto.fechaFin)}`;
      return { id, disponible: false, motivo: `Se superpone con otro viaje programado (${horario})` };
    }

    return { id, disponible: true, motivo: null };
  }

  const personasPorId = new Map(personas.map((u) => [u.id, u]));
  const vehiculosPorId = new Map(vehiculos.map((v) => [v.id, v]));

  const [choferes, resultadoVehiculos] = await Promise.all([
    Promise.all(
      choferIds.map((id) =>
        evaluar({
          id,
          entidad: personasPorId.get(id),
          campo: 'choferId',
          motivoDeHabilitacion: motivoDeChofer,
          estadoDoc: docsChoferes[id],
        })
      )
    ),
    Promise.all(
      vehiculoIds.map((id) =>
        evaluar({
          id,
          entidad: vehiculosPorId.get(id),
          campo: 'vehiculoId',
          motivoDeHabilitacion: motivoDeVehiculo,
          estadoDoc: docsVehiculos[id],
        })
      )
    ),
  ]);

  return { choferes, vehiculos: resultadoVehiculos };
}

function sinRepetidos(ids) {
  return [...new Set(ids)];
}

// Disponibilidad de los candidatos de un viaje existente, con sus propias
// fechas (y excluyéndolo a él mismo del solapamiento). Con `todos` evalúa
// además a todos los choferes activos y habilitados y a todos los vehículos no
// dados de baja (los de taller aparecen, con su motivo), para el "Elegir
// otro…" del modal de confirmar.
async function disponibilidadDeViaje(id, { todos = false } = {}) {
  const actual = await obtenerViaje(id);

  if (!actual.fechaInicio) {
    throw new ValidacionError({ fechaInicio: 'El viaje no tiene fecha de inicio' });
  }

  let choferIds = actual.choferesCandidatos.map((c) => c.personaId);
  let vehiculoIds = actual.vehiculosCandidatos.map((c) => c.vehiculoId);

  if (todos) {
    const [personas, vehiculos] = await Promise.all([
      prisma.persona.findMany({
        where: { habilitadoParaConducir: true, activo: true },
        select: { id: true },
      }),
      prisma.vehiculo.findMany({
        where: { estadoVehiculo: { descripcion: { not: 'DADO_DE_BAJA' } } },
        select: { id: true },
      }),
    ]);
    choferIds = sinRepetidos([...choferIds, ...personas.map((u) => u.id)]);
    vehiculoIds = sinRepetidos([...vehiculoIds, ...vehiculos.map((v) => v.id)]);
  }

  return calcularDisponibilidad({
    fechaInicio: actual.fechaInicio,
    fechaFin: actual.fechaFin,
    choferIds,
    vehiculoIds,
    excluirViajeId: actual.id,
  });
}

// Equivalente para el alta, cuando el viaje todavía no existe: recibe las
// fechas y los ids directamente. Valida solo la forma — un id que no exista
// vuelve como no disponible ("No encontrado") en vez de cortar la consulta.
async function disponibilidadParaAlta({ fechaInicio, fechaFin, choferIds, vehiculoIds } = {}) {
  const errores = {};

  let inicio = null;
  if (campoAusente(fechaInicio)) {
    errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
  } else {
    inicio = aFechaCordobaOInstancia(fechaInicio);
    if (!inicio || Number.isNaN(inicio.getTime())) {
      inicio = null;
      errores.fechaInicio = 'La fecha y hora de inicio no es válida';
    }
  }

  let fin = null;
  if (!campoAusente(fechaFin)) {
    fin = aFechaCordobaOInstancia(fechaFin);
    if (!fin || Number.isNaN(fin.getTime())) {
      fin = null;
      errores.fechaFin = 'La fecha y hora de fin no es válida';
    } else if (inicio && fin <= inicio) {
      errores.fechaFin = 'La fecha y hora de fin debe ser posterior al inicio';
    }
  }

  const choferes = validarFormatoListaIds(choferIds, 'choferIds');
  const vehiculos = validarFormatoListaIds(vehiculoIds, 'vehiculoIds');
  Object.assign(errores, choferes.errores, vehiculos.errores);

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return calcularDisponibilidad({
    fechaInicio: inicio,
    fechaFin: fin,
    choferIds: choferes.ids,
    vehiculoIds: vehiculos.ids,
  });
}

// `null` explícito siempre es válido (borra el dato); cualquier otro valor se
// valida con `validarFormato`. No distingue entre "no vino" y "vino válido":
// eso lo decide el caller con `presente()` antes de llamar a esto.
function procesarCampoSimple(payload, campo, data, errores, validarFormato) {
  if (!presente(payload, campo)) return;

  if (payload[campo] === null) {
    data[campo] = null;
    return;
  }

  const resultado = validarFormato(payload[campo]);
  if (resultado.error) {
    errores[campo] = resultado.error;
  } else {
    data[campo] = resultado.valor;
  }
}

function validarFormatoMonto(etiqueta) {
  return (valor) => {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) {
      return { error: `${etiqueta} debe ser un número mayor o igual a 0` };
    }
    // Precio en pesos con 2 decimales: se pasa como string a Prisma Decimal
    // para no arrastrar imprecisión de punto flotante (0.1 + 0.2 !== 0.3).
    return { valor: numero.toFixed(2) };
  };
}

function validarFormatoFecha(etiqueta) {
  return (valor) => {
    const fecha = aFechaCordoba(valor);
    if (!fecha || Number.isNaN(fecha.getTime())) {
      return { error: `${etiqueta} no es una fecha válida` };
    }
    return { valor: fecha };
  };
}

function validarFormatoIdPositivo(mensajeError) {
  return (valor) => {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
      return { error: mensajeError };
    }
    return { valor: numero };
  };
}

// Valida y arma los campos administrativos de un payload (parcial: un campo
// ausente no entra en `data`; `null` explícito sí, para borrar el dato). La usa
// actualizarDatosAdministrativos (PATCH), la única vía para cargar estos datos
// (el alta ya no los acepta). Lanza ValidacionError con los errores por campo;
// no toca la base.
async function validarYArmarDatosAdministrativos(payload) {
  const data = {};
  const errores = {};

  procesarCampoSimple(payload, 'precio', data, errores, validarFormatoMonto('El precio'));
  procesarCampoSimple(payload, 'pagoChofer', data, errores, validarFormatoMonto('El pago al chofer'));
  procesarCampoSimple(payload, 'fechaPagoCliente', data, errores, validarFormatoFecha('La fecha de pago al cliente'));
  procesarCampoSimple(payload, 'fechaPagoChofer', data, errores, validarFormatoFecha('La fecha de pago al chofer'));
  // clienteId NO se procesa acá: es un dato core del viaje (mismo nivel que
  // origenId/destinoId), se movió a crearViaje/actualizarViaje. Si llega en
  // este payload, se ignora en silencio — mismo criterio que cualquier otra
  // clave no reconocida en esta acción (ver el no-op de más abajo).
  procesarCampoSimple(
    payload,
    'estadoPagoClienteId',
    data,
    errores,
    validarFormatoIdPositivo('El estado de pago del cliente elegido no es válido')
  );
  procesarCampoSimple(
    payload,
    'metodoPagoClienteId',
    data,
    errores,
    validarFormatoIdPositivo('El método de pago del cliente elegido no es válido')
  );
  procesarCampoSimple(
    payload,
    'estadoPagoChoferId',
    data,
    errores,
    validarFormatoIdPositivo('El estado de pago del chofer elegido no es válido')
  );
  procesarCampoSimple(
    payload,
    'metodoPagoChoferId',
    data,
    errores,
    validarFormatoIdPositivo('El método de pago del chofer elegido no es válido')
  );

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  // Existencia en BD — solo para los que quedaron con un id numérico
  // (si vino `null`, ya se resolvió arriba como "borrar", no hay nada que
  // validar contra la base).
  if (typeof data.estadoPagoClienteId === 'number') {
    await validarEstadoPago(data.estadoPagoClienteId, 'estadoPagoClienteId');
  }
  if (typeof data.metodoPagoClienteId === 'number') {
    await validarMetodoPago(data.metodoPagoClienteId, 'metodoPagoClienteId');
  }
  if (typeof data.estadoPagoChoferId === 'number') {
    await validarEstadoPago(data.estadoPagoChoferId, 'estadoPagoChoferId');
  }
  if (typeof data.metodoPagoChoferId === 'number') {
    await validarMetodoPago(data.metodoPagoChoferId, 'metodoPagoChoferId');
  }

  return data;
}

const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';

// Cada pago (al cliente y al chofer) tiene su estado y su fecha. Un pago
// Pendiente no puede tener fecha de pago (SCRUM-249).
const PARES_PAGO = [
  {
    estado: 'estadoPagoClienteId',
    relacion: 'estadoPagoCliente',
    fecha: 'fechaPagoCliente',
    mensaje: 'Un pago al cliente Pendiente no puede tener fecha de pago. Borrá la fecha o cambiá el estado del pago.',
  },
  {
    estado: 'estadoPagoChoferId',
    relacion: 'estadoPagoChofer',
    fecha: 'fechaPagoChofer',
    mensaje: 'Un pago al chofer Pendiente no puede tener fecha de pago. Borrá la fecha o cambiá el estado del pago.',
  },
];

// Valida contra el estado RESULTANTE (lo que ya está en la base + lo que vino
// en el body), no solo contra el body: un PATCH con solo la fecha sobre un
// viaje que ya está Pendiente también se rechaza. Solo se revisan los pares en
// los que el body trae el estado o la fecha: un PATCH que no toca ese pago no
// queda bloqueado por un dato histórico inconsistente que no generó él.
//
// El caso inverso (Pagado sin fecha) no se valida a propósito.
async function validarPagosPendientesSinFecha(actual, data) {
  const errores = {};

  for (const par of PARES_PAGO) {
    const vinoEstado = par.estado in data;
    if (!vinoEstado && !(par.fecha in data)) continue;

    const estadoId = vinoEstado ? data[par.estado] : actual[par.estado];
    const fecha = par.fecha in data ? data[par.fecha] : actual[par.fecha];
    if (estadoId == null || fecha == null) continue;

    // Si el estado vino en el body ya se validó que existe
    // (validarYArmarDatosAdministrativos); si no, viene con el viaje.
    const descripcion = vinoEstado
      ? (await prisma.estadoPago.findUnique({ where: { id: estadoId } }))?.descripcion
      : actual[par.relacion]?.descripcion;

    if (descripcion === ESTADO_PAGO_PENDIENTE) {
      errores[par.fecha] = par.mensaje;
    }
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }
}

// Acción administrativa/financiera, separada por completo del ciclo de vida
// operativo del viaje: no valida nada contra el estado (funciona igual en
// Programado, En viaje, Finalizado o Cancelado) y es actualización PARCIAL,
// no reemplazo — a diferencia de actualizarViaje/validarYArmarDatos de
// arriba, acá un campo ausente del payload nunca se toca, y solo se pisa el
// que vino explícitamente (incluido `null`, para poder "deshacer" una carga
// anterior). Por eso no reusa validarDatos/validarYArmarDatos: esas dos
// funciones asumen que todos los campos siempre vienen y son obligatorios.
async function actualizarDatosAdministrativos(id, payload = {}, usuarioSolicitante) {
  const actual = await obtenerViaje(id);

  const data = await validarYArmarDatosAdministrativos(payload);

  // Ningún campo reconocido en el payload: no-op válido, no se toca la fila
  // (ni siquiera actualizadoEn).
  if (Object.keys(data).length === 0) {
    return serializarViaje(actual, usuarioSolicitante);
  }

  await validarPagosPendientesSinFecha(actual, data);

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data,
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return serializarViaje(viaje, usuarioSolicitante);
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

function parsearFechaDesde(valor) {
  if (!valor) return null;
  // Si viene solo la fecha (sin hora), el inicio del día se calcula en hora
  // de Córdoba, no UTC (new Date("2026-12-16") da medianoche UTC, que son
  // las 21:00 del día anterior en Córdoba).
  const valorConHora = SOLO_FECHA_REGEX.test(valor) ? `${valor}T00:00:00.000` : valor;
  const fecha = aFechaCordoba(valorConHora);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function parsearFechaHasta(valor) {
  if (!valor) return null;
  // Si viene solo la fecha (sin hora), tomamos el final de ese día en hora
  // de Córdoba, para que el rango incluya todos los viajes que empiezan ese
  // día calendario en Córdoba (no el día calendario en UTC).
  const valorConHora = SOLO_FECHA_REGEX.test(valor) ? `${valor}T23:59:59.999` : valor;
  const fecha = aFechaCordoba(valorConHora);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// `excluirAConfirmar` lo usa /mis-viajes: tiene que excluir A_CONFIRMAR
// SIEMPRE, incluso si alguien pide explícitamente estado=A_CONFIRMAR contra
// ese endpoint puntual — en ese caso la combinación `equals: 'A_CONFIRMAR'` +
// `not: 'A_CONFIRMAR'` en el mismo filtro es deliberadamente contradictoria:
// Postgres nunca encuentra una fila que sea igual Y distinta de lo mismo, así
// que da una lista vacía en vez de un error o de ignorar el filtro. El
// listado general (GET /viajes) nunca pasa esta opción, así que ve
// A_CONFIRMAR con total normalidad.
//
// --- Vistas del listado (GET /viajes?vista=...) -------------------------------
//
// Mismo corte que Mis viajes (frontend/src/utils/misViajes.js): por estado.
// - proximos: los que siguen abiertos (A confirmar, Programado, En viaje), sea
//   cual sea su fecha. Van primero los "sin cerrar" (de días anteriores a hoy en
//   Córdoba), después los En viaje que no son sin cerrar y después el resto, del
//   más próximo al más lejano; los que no tienen fecha (A confirmar), al final.
// - anteriores: Finalizados y Cancelados, el más reciente primero.
// Un viaje de un día anterior que sigue abierto es "sin cerrar": es la única
// definición, la usan el listado y el Dashboard de gestión (que la lee del campo
// `sinCerrar` de la respuesta, no la recalcula).
const VISTAS_LISTADO = {
  proximos: ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE'],
  anteriores: ['FINALIZADO', 'CANCELADO'],
};

const ORDEN_VISTA = {
  proximos: [{ fechaInicio: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  anteriores: [{ fechaInicio: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
};

// undefined (no vino) o el nombre de una vista; cualquier otro valor es un 400:
// ignorarlo devolvería el listado completo, que no es lo que se pidió.
function validarVista(vista) {
  if (vista === undefined) return undefined;
  if (typeof vista === 'string' && Object.hasOwn(VISTAS_LISTADO, vista)) return vista;
  throw new ValidacionError({ vista: "La vista tiene que ser 'proximos' o 'anteriores'" });
}

const esSinCerrar = (viaje, inicioDeHoy) => viaje.fechaInicio != null && viaje.fechaInicio < inicioDeHoy;

// Orden de Próximos sobre la lista que ya viene por fecha ascendente: los sin
// cerrar ya quedan primero (son los más viejos); solo hay que adelantar los En
// viaje al resto. Devuelve [{ viaje, sinCerrar }].
function ordenarProximos(viajes, inicioDeHoy) {
  const sinCerrar = [];
  const enViaje = [];
  const resto = [];
  for (const viaje of viajes) {
    if (esSinCerrar(viaje, inicioDeHoy)) sinCerrar.push(viaje);
    else if (viaje.estadoViaje.descripcion === 'EN_VIAJE') enViaje.push(viaje);
    else resto.push(viaje);
  }
  return [
    ...sinCerrar.map((viaje) => ({ viaje, sinCerrar: true })),
    ...[...enViaje, ...resto].map((viaje) => ({ viaje, sinCerrar: false })),
  ];
}

// --- Búsqueda del listado (GET /viajes?q=...) ----------------------------------
//
// Por nombre del cliente, del origen, del destino o de una parada, sin distinguir
// mayúsculas ni tildes ("cordoba" encuentra "Córdoba"). Para eso se busca en
// nombreNormalizado (minúsculas y sin acentos, ver utils/normalizarNombre), que
// ya tienen todos los clientes y las ubicaciones frecuentes, con el texto pasado
// por la misma función: sin unaccent ni migraciones. Las ubicaciones
// particulares (direcciones de Google) no tienen nombreNormalizado: para ellas se
// busca en el nombre con mode: 'insensitive', que no distingue mayúsculas pero sí
// tildes.
const MAX_LONGITUD_BUSQUEDA = 100;

// null si no hay búsqueda (no vino, o vacía o solo espacios); si no, el texto sin
// espacios en los extremos. Más largo que el máximo, o algo que no es un texto
// (?q=a&q=b), es un 400.
function validarBusqueda(q) {
  if (q === undefined || q === null) return null;
  if (typeof q !== 'string') {
    throw new ValidacionError({ q: 'La búsqueda debe ser un texto' });
  }
  const texto = q.trim();
  if (texto === '') return null;
  if ([...texto].length > MAX_LONGITUD_BUSQUEDA) {
    throw new ValidacionError({ q: `La búsqueda no puede superar los ${MAX_LONGITUD_BUSQUEDA} caracteres` });
  }
  return texto;
}

// Prisma arma `contains` como un LIKE '%…%' de Postgres y no escapa los
// comodines: sin esto, "%" o "_" encontrarían cualquier viaje. Se escapan con la
// barra invertida, el carácter de escape por defecto de LIKE.
const escaparComodines = (texto) => texto.replace(/[\\%_]/g, '\\$&');

function filtroBusqueda(texto) {
  const normalizado = escaparComodines(normalizarNombre(texto));
  const literal = escaparComodines(texto);
  const enUbicacion = {
    OR: [{ nombreNormalizado: { contains: normalizado } }, { nombre: { contains: literal, mode: 'insensitive' } }],
  };
  return {
    OR: [
      { cliente: { is: { nombreNormalizado: { contains: normalizado } } } },
      { origen: { is: enUbicacion } },
      { destino: { is: enUbicacion } },
      { paradas: { some: { ubicacion: enUbicacion } } },
    ],
  };
}

// `administrativoPendiente` ('true' en la query) deja solo los viajes con algún
// pendiente administrativo (ver FILTRO_ADMINISTRATIVO_PENDIENTE). Filtrar por
// precio/pago ya revela esos datos, así que sigue la misma regla que la
// serialización: solo Administrador/Encargado; para el resto es un 403 (no se
// ignora en silencio, porque devolvería un listado que no es lo que se pidió).
//
// `vista` ('proximos' | 'anteriores', ver VISTAS_LISTADO) corta y ordena el
// listado; los demás filtros se aplican dentro de la vista (un estado que no es
// de la vista da una lista vacía). En Próximos cada viaje trae además
// `sinCerrar`. Sin `vista`, todo sigue como antes: todos los estados, del más
// futuro al más viejo y sin `sinCerrar` (lo usan el Dashboard y otras pantallas).
//
// `q` busca por cliente o lugar (ver filtroBusqueda), también dentro de la vista.
async function listarViajes(
  {
    estado,
    choferId,
    vehiculoId,
    fechaDesde,
    fechaHasta,
    administrativoPendiente,
    vista,
    q,
    excluirAConfirmar = false,
  } = {},
  usuarioSolicitante
) {
  const vistaValida = validarVista(vista);
  const busqueda = validarBusqueda(q);
  const where = {};
  const condiciones = [];

  if (administrativoPendiente === 'true') {
    if (!puedeVerDatosAdministrativos(usuarioSolicitante)) {
      throw new PermisoDenegadoError('Solo Administrador y Encargado pueden filtrar por datos administrativos');
    }
    condiciones.push(FILTRO_ADMINISTRATIVO_PENDIENTE);
  }
  if (busqueda) {
    condiciones.push(filtroBusqueda(busqueda));
  }
  if (condiciones.length > 0) {
    where.AND = condiciones;
  }

  const filtroEstado = {};
  if (estado && ESTADOS_VIAJE_VALIDOS.includes(estado)) {
    filtroEstado.equals = estado;
  }
  if (excluirAConfirmar) {
    filtroEstado.not = 'A_CONFIRMAR';
  }
  if (vistaValida) {
    filtroEstado.in = VISTAS_LISTADO[vistaValida];
  }
  if (Object.keys(filtroEstado).length > 0) {
    where.estadoViaje = { descripcion: filtroEstado };
  }

  const choferIdNumero = Number(choferId);
  if (choferId && Number.isInteger(choferIdNumero) && choferIdNumero > 0) {
    where.choferId = choferIdNumero;
  }

  const vehiculoIdNumero = Number(vehiculoId);
  if (vehiculoId && Number.isInteger(vehiculoIdNumero) && vehiculoIdNumero > 0) {
    where.vehiculoId = vehiculoIdNumero;
  }

  const fechaDesdeDate = parsearFechaDesde(fechaDesde);
  const fechaHastaDate = parsearFechaHasta(fechaHasta);

  if (fechaDesdeDate || fechaHastaDate) {
    where.fechaInicio = {
      ...(fechaDesdeDate ? { gte: fechaDesdeDate } : {}),
      ...(fechaHastaDate ? { lte: fechaHastaDate } : {}),
    };
  }

  const viajes = await prisma.viaje.findMany({
    where,
    include: INCLUDE_RELACIONES_VIAJE,
    // nulls: 'last' — los A_CONFIRMAR sin fechaInicio todavía van al final
    // del listado en vez de reventar la query o aparecer primero/mezclados
    // (Postgres por defecto pone los NULL primero en DESC, que sería peor:
    // los viajes sin programar todavía tapando los reales arriba de todo).
    // Con vista, el id desempata para que el orden no cambie entre pedidos.
    orderBy: vistaValida ? ORDEN_VISTA[vistaValida] : { fechaInicio: { sort: 'desc', nulls: 'last' } },
  });

  if (vistaValida !== 'proximos') {
    return Promise.all(viajes.map((viaje) => serializarViaje(viaje, usuarioSolicitante)));
  }

  // "Hoy" es el día de Córdoba: su inicio es las 00:00 de Córdoba.
  const { inicio: inicioDeHoy } = rangoDelDiaCordoba(new Date());
  return Promise.all(
    ordenarProximos(viajes, inicioDeHoy).map(async ({ viaje, sinCerrar }) => ({
      ...(await serializarViaje(viaje, usuarioSolicitante)),
      sinCerrar,
    }))
  );
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
