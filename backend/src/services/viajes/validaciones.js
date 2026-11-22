// Validaciones de los campos de un viaje (core, operativos, paradas y candidatos)
// y las reglas de habilitación y solapamiento que comparten alta, edición,
// confirmación, comienzo y disponibilidad.
const prisma = require('../prismaClient');
const documentoService = require('../documentoService');
const { campoAusente, validarExtremosRecorrido, errorDeSecuencia } = require('../../utils/recorridoViaje');
// Fechas sin offset = hora de Córdoba (UTC-3 todo el año): ver utils/fechaCordoba.
const { aFechaCordoba } = require('../../utils/fechaCordoba');
const { ValidacionError } = require('./errores');

const ESTADO_VEHICULO_HABILITADO = 'OPERATIVO';

// Igual que aFechaCordoba, pero devuelve sin tocar un Date ya parseado. Hace
// falta en confirmarViaje (ciclo.js), que combina valores guardados (Date, vía
// Prisma) con los del payload (string de HTTP): pasar un Date por
// aFechaCordoba lo convertiría a texto con `String(date)` y lo parsearía mal.
function aFechaCordobaOInstancia(valor) {
  if (valor instanceof Date) return valor;
  return aFechaCordoba(valor);
}

// clienteId/origenId/destinoId: dato "core" del viaje (quién lo pidió y
// adónde), no operativo — siempre obligatorios, en cualquier estado, tanto al
// crear como al editar (a diferencia de los campos operativos de
// validarCamposOperativos, que dependen de si el viaje es A_CONFIRMAR o no).
//
// Origen y destino se validan con validarExtremosRecorrido (utils/recorridoViaje),
// la misma regla que usa el cálculo de km: origen == destino solo es un error si
// el viaje NO tiene paradas.
function validarCamposCore({ clienteId, origenId, destinoId }, { hayParadas = false } = {}) {
  const errores = {};

  const clienteIdNumero = Number(clienteId);
  if (campoAusente(clienteId)) {
    errores.clienteId = 'El cliente es obligatorio';
  } else if (!Number.isInteger(clienteIdNumero) || clienteIdNumero <= 0) {
    errores.clienteId = 'El cliente elegido no es válido';
  }

  const extremos = validarExtremosRecorrido({ origenId, destinoId }, { hayParadas });
  Object.assign(errores, extremos.errores);

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return { clienteId: clienteIdNumero, origenId: extremos.origenId, destinoId: extremos.destinoId };
}

// Los 5 campos operativos (quién maneja, qué vehículo, cuándo, cuántos km).
// `obligatorios` decide el modo:
//  - true: los 5 son obligatorios (al editar un viaje PROGRAMADO y al confirmar).
//  - false: un campo ausente no es error, simplemente resuelve a `null`
//    explícito (nunca `undefined` — actualizarViaje/crearViaje son reemplazo
//    completo, no actualización parcial, así que un campo que no vino tiene
//    que BORRARSE, no "dejarse como estaba"). Si el campo SÍ vino, igual se le
//    exige formato válido — la obligatoriedad se relaja, no la validación.
//    Usado al crear (todo viaje nace A_CONFIRMAR) y al editar un A_CONFIRMAR.
//
// La excepción es `fechaInicio`: es obligatoria en AMBOS modos, o sea al crear
// y al editar en cualquier estado. El encargado confirma "el día anterior", así
// que sin fecha no hay forma de saber cuándo hacerlo. La columna sigue siendo
// nullable en la base solo por los viajes históricos.
function validarCamposOperativos(
  { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
  { obligatorios }
) {
  const errores = {};
  const datos = {};

  if (campoAusente(choferId)) {
    if (obligatorios) errores.choferId = 'El chofer es obligatorio';
    datos.choferId = null;
  } else {
    const numero = Number(choferId);
    if (!Number.isInteger(numero) || numero <= 0) {
      errores.choferId = 'El chofer elegido no es válido';
    } else {
      datos.choferId = numero;
    }
  }

  if (campoAusente(vehiculoId)) {
    if (obligatorios) errores.vehiculoId = 'El vehículo es obligatorio';
    datos.vehiculoId = null;
  } else {
    const numero = Number(vehiculoId);
    if (!Number.isInteger(numero) || numero <= 0) {
      errores.vehiculoId = 'El vehículo elegido no es válido';
    } else {
      datos.vehiculoId = numero;
    }
  }

  if (campoAusente(fechaInicio)) {
    errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
    datos.fechaInicio = null;
  } else {
    const fecha = aFechaCordobaOInstancia(fechaInicio);
    if (!fecha || Number.isNaN(fecha.getTime())) {
      errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
    } else {
      datos.fechaInicio = fecha;
    }
  }

  if (campoAusente(fechaFin)) {
    if (obligatorios) errores.fechaFin = 'La fecha y hora de fin es obligatoria';
    datos.fechaFin = null;
  } else {
    const fecha = aFechaCordobaOInstancia(fechaFin);
    if (!fecha || Number.isNaN(fecha.getTime())) {
      errores.fechaFin = 'La fecha y hora de fin es obligatoria';
    } else {
      datos.fechaFin = fecha;
    }
  }

  if (datos.fechaInicio && datos.fechaFin && datos.fechaFin <= datos.fechaInicio) {
    errores.fechaFin = 'La fecha y hora de fin debe ser posterior al inicio';
  }

  if (campoAusente(kilometrosEstimados)) {
    if (obligatorios) errores.kilometrosEstimados = 'Los kilómetros estimados son obligatorios';
    datos.kilometrosEstimados = null;
  } else {
    const numero = Number(kilometrosEstimados);
    if (!Number.isInteger(numero) || numero <= 0) {
      errores.kilometrosEstimados = 'Los kilómetros estimados deben ser un número mayor a 0';
    } else {
      datos.kilometrosEstimados = numero;
    }
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return datos;
}

// Dato informativo (cuántas personas viajan): opcional en todos los estados
// porque no siempre se conoce al crear el viaje. Ausente, null o vacío → null
// (reemplazo completo, igual que los campos operativos). Si viene, entero > 0.
// A propósito NO se compara con Vehiculo.asientos: no restringe nada.
//
// No lanza: devuelve `{ valor, errores }` para que el caller junte este error
// con los de los campos operativos en un solo ValidacionError (el 400 trae
// todos los campos inválidos juntos, ver validarYArmarOperativos).
function validarCantidadPasajeros(cantidadPasajeros) {
  if (campoAusente(cantidadPasajeros)) return { valor: null, errores: {} };

  const numero = typeof cantidadPasajeros === 'boolean' ? NaN : Number(cantidadPasajeros);
  if (!Number.isInteger(numero) || numero <= 0) {
    return {
      valor: null,
      errores: { cantidadPasajeros: 'La cantidad de pasajeros debe ser un número entero mayor a 0' },
    };
  }

  return { valor: numero, errores: {} };
}

async function obtenerEstadoViajePorDescripcion(descripcion) {
  const estado = await prisma.estadoViaje.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de viaje "${descripcion}" no configurado`);
  }
  return estado;
}

// Las reglas de habilitación, sin mensajes: las comparten validarChofer /
// validarVehiculo (que las traducen a un error de validación al crear, editar,
// confirmar y comenzar) y calcularDisponibilidad (que las traduce a un motivo
// para mostrar). Así la regla vive en un solo lugar.
const PROBLEMA_CHOFER = { INACTIVO: 'INACTIVO', NO_HABILITADO: 'NO_HABILITADO' };

function problemaDeChofer(chofer) {
  if (chofer.activo === false || (chofer.estadoUsuario && chofer.estadoUsuario.descripcion !== 'ACTIVO')) {
    return PROBLEMA_CHOFER.INACTIVO;
  }
  if (!chofer.habilitadoParaConducir) return PROBLEMA_CHOFER.NO_HABILITADO;
  return null;
}

// Devuelve la descripción del estado cuando no es OPERATIVO (EN_TALLER,
// DADO_DE_BAJA); null si el vehículo está habilitado.
function problemaDeVehiculo(vehiculo) {
  const estado = vehiculo.estadoVehiculo.descripcion;
  return estado === ESTADO_VEHICULO_HABILITADO ? null : estado;
}

async function validarChofer(choferId) {
  const chofer = await prisma.persona.findUnique({
    where: { id: choferId },
  });

  if (!chofer) {
    throw new ValidacionError({ choferId: 'El chofer elegido no existe' });
  }
  const problema = problemaDeChofer(chofer);
  if (problema === PROBLEMA_CHOFER.INACTIVO) {
    throw new ValidacionError({ choferId: 'El chofer elegido está inactivo' });
  }
  if (problema === PROBLEMA_CHOFER.NO_HABILITADO) {
    throw new ValidacionError({ choferId: 'El chofer elegido no está habilitado para conducir' });
  }

  return chofer;
}

async function validarVehiculo(vehiculoId) {
  const vehiculo = await prisma.vehiculo.findUnique({
    where: { id: vehiculoId },
    include: { estadoVehiculo: true },
  });

  if (!vehiculo) {
    throw new ValidacionError({ vehiculoId: 'El vehículo elegido no existe' });
  }
  if (problemaDeVehiculo(vehiculo)) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo elegido no está disponible (debe estar Operativo)',
    });
  }

  return vehiculo;
}

// Existencia pura, sin elegibilidad de negocio (ACTIVO/habilitadoParaConducir,
// OPERATIVO): la usa el alta/edición de un viaje A_CONFIRMAR, donde todavía no
// importa si el chofer o el vehículo están disponibles.
async function validarExistenciaPersona(id, campo) {
  const persona = await prisma.persona.findUnique({ where: { id } });
  if (!persona) {
    throw new ValidacionError({ [campo]: 'El chofer elegido no existe' });
  }
  return persona;
}

async function validarExistenciaVehiculo(id, campo) {
  const vehiculo = await prisma.vehiculo.findUnique({ where: { id } });
  if (!vehiculo) {
    throw new ValidacionError({ [campo]: 'El vehículo elegido no existe' });
  }
  return vehiculo;
}

async function validarUbicacion(id, campo) {
  const ubicacion = await prisma.ubicacion.findUnique({ where: { id } });
  if (!ubicacion) {
    throw new ValidacionError({ [campo]: 'La ubicación elegida no existe' });
  }
  return ubicacion;
}

async function validarCliente(id, campo) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) {
    throw new ValidacionError({ [campo]: 'El cliente elegido no existe' });
  }
  return cliente;
}

// Única consulta de solapamiento del sistema: devuelve el viaje PROGRAMADO que
// se superpone (para poder mostrar su horario) o null. Solo cuentan los
// PROGRAMADO: un A_CONFIRMAR todavía no reserva a nadie.
//
// `estadoProgramadoId` es opcional: quien consulta muchos candidatos de una vez
// (calcularDisponibilidad) lo resuelve una sola vez en vez de repetir la
// búsqueda del estado en cada consulta.
async function buscarSolapamiento({ campo, id, fechaInicio, fechaFin, excluirViajeId, estadoProgramadoId }) {
  const programadoId = estadoProgramadoId ?? (await obtenerEstadoViajePorDescripcion('PROGRAMADO')).id;

  return prisma.viaje.findFirst({
    where: {
      [campo]: id,
      estadoViajeId: programadoId,
      fechaInicio: { lt: fechaFin },
      fechaFin: { gt: fechaInicio },
      ...(excluirViajeId ? { id: { not: excluirViajeId } } : {}),
    },
  });
}

async function existeSolapamiento(parametros) {
  return Boolean(await buscarSolapamiento(parametros));
}

// Validación de negocio completa de los 5 campos operativos, ya bien formados
// y presentes: chofer y vehículo habilitados, documentación vigente y sin
// solapamiento. La usan actualizarViaje (viaje PROGRAMADO) y confirmarViaje;
// crearViaje no, porque todo viaje nace A_CONFIRMAR. Hay que excluir el propio
// viaje del solapamiento (si no, siempre chocaría contra su propio horario).
async function validarDisponibilidadOperativa({ choferId, vehiculoId, fechaInicio, fechaFin }, { excluirViajeId } = {}) {
  await validarChofer(choferId);
  await validarVehiculo(vehiculoId);

  const [docChofer, docVehiculo] = await Promise.all([
    documentoService.evaluarDocumentacionChofer(choferId, { fechaInicio, fechaFin }),
    documentoService.evaluarDocumentacionVehiculo(vehiculoId, { fechaInicio, fechaFin }),
  ]);
  const erroresDocs = {};
  if (docChofer?.tieneVencidos) {
    erroresDocs.choferId = `No se puede asignar el chofer: tiene documentación vencida (${docChofer.vencidos.join(', ')})`;
  }
  if (docVehiculo?.tieneVencidos) {
    erroresDocs.vehiculoId = `No se puede asignar el vehículo: tiene documentación vencida (${docVehiculo.vencidos.join(', ')})`;
  }
  if (Object.keys(erroresDocs).length > 0) {
    throw new ValidacionError(erroresDocs);
  }

  // TODO: validar umbral de mantenimiento preventivo cuando exista la tabla de planes (SCRUM-34)

  const choferSolapado = await existeSolapamiento({
    campo: 'choferId',
    id: choferId,
    fechaInicio,
    fechaFin,
    excluirViajeId,
  });
  if (choferSolapado) {
    throw new ValidacionError({
      choferId: 'El chofer ya tiene un viaje programado que se superpone con este horario',
    });
  }

  const vehiculoSolapado = await existeSolapamiento({
    campo: 'vehiculoId',
    id: vehiculoId,
    fechaInicio,
    fechaFin,
    excluirViajeId,
  });
  if (vehiculoSolapado) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo ya tiene un viaje programado que se superpone con este horario',
    });
  }
}

// Formato y existencia en BD; lo comparten crearViaje y actualizarViaje.
async function validarYArmarCore({ clienteId, origenId, destinoId }, { hayParadas = false } = {}) {
  const core = validarCamposCore({ clienteId, origenId, destinoId }, { hayParadas });

  await validarCliente(core.clienteId, 'clienteId');
  await validarUbicacion(core.origenId, 'origenId');
  await validarUbicacion(core.destinoId, 'destinoId');

  return core;
}

// Con `obligatorios: true` corre la validación de negocio completa
// (validarDisponibilidadOperativa); con false, los presentes solo se validan
// por existencia. `erroresPrevios` son errores de formato de otros campos del
// mismo payload (p. ej. cantidadPasajeros): se juntan para que un único 400
// los traiga a todos. Las consultas a la base solo corren si el formato de
// todo está bien.
async function validarYArmarOperativos(campos, { obligatorios, excluirViajeId, erroresPrevios = {} } = {}) {
  let datos;
  const errores = { ...erroresPrevios };
  try {
    datos = validarCamposOperativos(campos, { obligatorios });
  } catch (err) {
    if (!(err instanceof ValidacionError)) throw err;
    Object.assign(errores, err.errores);
  }
  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  if (obligatorios) {
    await validarDisponibilidadOperativa(datos, { excluirViajeId });
  } else {
    if (datos.choferId !== null) await validarExistenciaPersona(datos.choferId, 'choferId');
    if (datos.vehiculoId !== null) await validarExistenciaVehiculo(datos.vehiculoId, 'vehiculoId');
  }

  return datos;
}

// --- Paradas ----------------------------------------------------------------
//
// Puntos intermedios ORDENADOS entre origen y destino. El front manda solo los
// ids de ubicación en el orden del recorrido; el `orden` (1..n) lo asigna el
// backend según la posición. A diferencia de los candidatos, una ubicación SÍ
// puede repetirse (un ida y vuelta pasa dos veces por el mismo lugar); lo único
// que no puede es repetirse de forma CONSECUTIVA.

// MAX_PARADAS, validarFormatoParadas y errorDeSecuencia viven en
// utils/recorridoViaje (los comparte el cálculo de km).

// Existencia de todas las ubicaciones de la lista (un findMany, no uno por id).
async function validarExistenciaParadas(ids) {
  if (ids.length === 0) return;

  const unicos = [...new Set(ids)];
  const encontradas = await prisma.ubicacion.findMany({ where: { id: { in: unicos } }, select: { id: true } });
  if (encontradas.length !== unicos.length) {
    throw new ValidacionError({ paradas: 'Alguna parada elegida no existe' });
  }
}

// Reemplazo completo dentro de una transacción: primero deleteMany y recién
// después createMany, así reordenar no choca contra @@unique([viajeId, orden]).
async function reemplazarParadas(tx, viajeId, ids) {
  await tx.viajeParada.deleteMany({ where: { viajeId } });
  if (ids.length > 0) {
    await tx.viajeParada.createMany({
      data: ids.map((ubicacionId, indice) => ({ viajeId, ubicacionId, orden: indice + 1 })),
    });
  }
}

// Forma de la lista + secuencia, ya con el core validado (hacen falta los ids
// de origen y destino numéricos). Devuelve los ids y los errores para juntarlos
// con los de los demás campos.
function validarParadasDelRecorrido(formato, core) {
  const errores = { ...formato.errores };
  if (Object.keys(errores).length === 0) {
    const mensaje = errorDeSecuencia(core.origenId, formato.ids, core.destinoId);
    if (mensaje) errores.paradas = mensaje;
  }
  return { ids: formato.ids, errores };
}

// --- Candidatos -------------------------------------------------------------
//
// Mientras un viaje está A_CONFIRMAR no tiene chofer ni vehículo asignado
// (choferId/vehiculoId en null): tiene listas de choferes y vehículos POSIBLES,
// y recién al confirmar se elige uno de cada uno. Por eso en A_CONFIRMAR no se
// aceptan choferId/vehiculoId sueltos (400, en vez de ignorarlos en silencio:
// un cliente que los mande tiene que enterarse de que no se guardaron), y en
// PROGRAMADO no se aceptan candidatos.

const ERROR_ASIGNADO_EN_A_CONFIRMAR =
  'Un viaje A confirmar no lleva asignado: indicá los posibles en los candidatos';

// Forma de una lista de ids (todavía sin tocar la base): ausente/null → [], si
// viene tiene que ser un arreglo de enteros positivos sin repetidos.
function validarFormatoListaIds(valor, campo) {
  if (valor === undefined || valor === null) return { ids: [], errores: {} };

  if (!Array.isArray(valor)) {
    return { ids: [], errores: { [campo]: 'Debe ser una lista de ids' } };
  }

  const ids = valor.map((v) => (typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return { ids: [], errores: { [campo]: 'La lista tiene ids que no son válidos' } };
  }
  if (new Set(ids).size !== ids.length) {
    return { ids: [], errores: { [campo]: 'La lista tiene elementos repetidos' } };
  }

  return { ids, errores: {} };
}

function validarFormatoCandidatos({ choferesCandidatos, vehiculosCandidatos }) {
  const choferes = validarFormatoListaIds(choferesCandidatos, 'choferesCandidatos');
  const vehiculos = validarFormatoListaIds(vehiculosCandidatos, 'vehiculosCandidatos');
  return {
    choferes: choferes.ids,
    vehiculos: vehiculos.ids,
    errores: { ...choferes.errores, ...vehiculos.errores },
  };
}

// Existencia pura (un findMany por lista, no uno por id), igual que el resto de
// las validaciones de A_CONFIRMAR: si un candidato está inactivo o en taller no
// es un error, es justamente lo que informa la disponibilidad.
async function validarExistenciaCandidatos({ choferes, vehiculos }) {
  const errores = {};

  if (choferes.length > 0) {
    const encontrados = await prisma.persona.findMany({ where: { id: { in: choferes } }, select: { id: true } });
    if (encontrados.length !== choferes.length) errores.choferesCandidatos = 'Algún chofer elegido no existe';
  }
  if (vehiculos.length > 0) {
    const encontrados = await prisma.vehiculo.findMany({ where: { id: { in: vehiculos } }, select: { id: true } });
    if (encontrados.length !== vehiculos.length) errores.vehiculosCandidatos = 'Algún vehículo elegido no existe';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }
}

// Errores de formato de un viaje A_CONFIRMAR: asignado suelto o candidatos mal
// formados. Se juntan con los de los campos operativos.
function erroresCandidatosAConfirmar({ choferId, vehiculoId }, candidatos) {
  const errores = { ...candidatos.errores };
  if (!campoAusente(choferId)) errores.choferId = ERROR_ASIGNADO_EN_A_CONFIRMAR;
  if (!campoAusente(vehiculoId)) errores.vehiculoId = ERROR_ASIGNADO_EN_A_CONFIRMAR;
  return errores;
}

// Distingue "campo ausente" (no tocar) de "campo presente" — incluido el
// caso `null` explícito (borrar el dato).
function presente(payload, campo) {
  return Object.prototype.hasOwnProperty.call(payload, campo);
}

module.exports = {
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
};
