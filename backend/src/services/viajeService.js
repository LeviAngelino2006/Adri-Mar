const prisma = require('./prismaClient');

const ESTADO_VEHICULO_HABILITADO = 'OPERATIVO';
const ESTADOS_VIAJE_VALIDOS = ['PROGRAMADO', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Adri-mar opera únicamente en Córdoba, Argentina, que no tiene horario de
// verano (UTC-3 todo el año). Por eso el offset se puede fijar así, sin
// necesidad de una librería de zonas horarias.
const CORDOBA_UTC_OFFSET = '-03:00';
const TIENE_OFFSET_REGEX = /(Z|[+-]\d{2}:\d{2})$/;

// Interpreta un string de fecha/hora SIN offset (como el que manda un
// <input type="datetime-local">, p. ej. "2026-12-16T23:30") como hora de
// Córdoba, en vez de dejar que Node lo interprete según la zona horaria del
// proceso del servidor (que puede no coincidir con Córdoba según dónde se
// despliegue el backend). Si el valor ya trae offset explícito (u "Z"), se
// respeta tal cual.
function aFechaCordoba(valor) {
  if (!valor) return null;

  if (TIENE_OFFSET_REGEX.test(valor)) {
    return new Date(valor);
  }

  const conSegundos = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor) ? `${valor}:00` : valor;
  return new Date(`${conSegundos}${CORDOBA_UTC_OFFSET}`);
}

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function validarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const errores = {};

  const choferIdNumero = Number(choferId);
  if (choferId === undefined || choferId === null || choferId === '') {
    errores.choferId = 'El chofer es obligatorio';
  } else if (!Number.isInteger(choferIdNumero) || choferIdNumero <= 0) {
    errores.choferId = 'El chofer elegido no es válido';
  }

  const vehiculoIdNumero = Number(vehiculoId);
  if (vehiculoId === undefined || vehiculoId === null || vehiculoId === '') {
    errores.vehiculoId = 'El vehículo es obligatorio';
  } else if (!Number.isInteger(vehiculoIdNumero) || vehiculoIdNumero <= 0) {
    errores.vehiculoId = 'El vehículo elegido no es válido';
  }

  const fechaInicioDate = fechaInicio ? aFechaCordoba(fechaInicio) : null;
  if (!fechaInicio || Number.isNaN(fechaInicioDate.getTime())) {
    errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
  }

  const fechaFinDate = fechaFin ? aFechaCordoba(fechaFin) : null;
  if (!fechaFin || Number.isNaN(fechaFinDate.getTime())) {
    errores.fechaFin = 'La fecha y hora de fin es obligatoria';
  }

  if (fechaInicioDate && fechaFinDate && !Number.isNaN(fechaInicioDate.getTime()) && !Number.isNaN(fechaFinDate.getTime())) {
    if (fechaFinDate <= fechaInicioDate) {
      errores.fechaFin = 'La fecha y hora de fin debe ser posterior al inicio';
    }
  }

  const kilometrosEstimadosNumero = Number(kilometrosEstimados);
  if (kilometrosEstimados === undefined || kilometrosEstimados === null || kilometrosEstimados === '') {
    errores.kilometrosEstimados = 'Los kilómetros estimados son obligatorios';
  } else if (!Number.isInteger(kilometrosEstimadosNumero) || kilometrosEstimadosNumero <= 0) {
    errores.kilometrosEstimados = 'Los kilómetros estimados deben ser un número mayor a 0';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return {
    choferId: choferIdNumero,
    vehiculoId: vehiculoIdNumero,
    fechaInicio: fechaInicioDate,
    fechaFin: fechaFinDate,
    kilometrosEstimados: kilometrosEstimadosNumero,
  };
}

async function obtenerEstadoViajePorDescripcion(descripcion) {
  const estado = await prisma.estadoViaje.findUnique({ where: { descripcion } });
  if (!estado) {
    throw new Error(`Estado de viaje "${descripcion}" no configurado`);
  }
  return estado;
}

async function validarChofer(choferId) {
  const chofer = await prisma.usuario.findUnique({
    where: { id: choferId },
    include: { estadoUsuario: true },
  });

  if (!chofer) {
    throw new ValidacionError({ choferId: 'El chofer elegido no existe' });
  }
  if (chofer.estadoUsuario.descripcion !== 'ACTIVO') {
    throw new ValidacionError({ choferId: 'El chofer elegido está inactivo' });
  }
  if (!chofer.habilitadoParaConducir) {
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
  if (vehiculo.estadoVehiculo.descripcion !== ESTADO_VEHICULO_HABILITADO) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo elegido no está disponible (debe estar Operativo)',
    });
  }

  return vehiculo;
}

async function existeSolapamiento({ campo, id, fechaInicio, fechaFin, excluirViajeId }) {
  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const conflicto = await prisma.viaje.findFirst({
    where: {
      [campo]: id,
      estadoViajeId: estadoProgramado.id,
      fechaInicio: { lt: fechaFin },
      fechaFin: { gt: fechaInicio },
      ...(excluirViajeId ? { id: { not: excluirViajeId } } : {}),
    },
  });

  return Boolean(conflicto);
}

// Validaciones comunes al alta y a la edición: datos bien formados, chofer y
// vehículo habilitados, y sin solapamiento. En la edición hay que excluir el
// propio viaje de la búsqueda de solapamiento (si no, siempre "chocaría"
// contra su propio horario original).
async function validarYArmarDatos(
  { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
  { excluirViajeId } = {}
) {
  const datos = validarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados });

  await validarChofer(datos.choferId);
  await validarVehiculo(datos.vehiculoId);

  // TODO: validar umbral de mantenimiento preventivo cuando exista la tabla de planes (SCRUM-34)

  const choferSolapado = await existeSolapamiento({
    campo: 'choferId',
    id: datos.choferId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    excluirViajeId,
  });
  if (choferSolapado) {
    throw new ValidacionError({
      choferId: 'El chofer ya tiene un viaje programado que se superpone con este horario',
    });
  }

  const vehiculoSolapado = await existeSolapamiento({
    campo: 'vehiculoId',
    id: datos.vehiculoId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    excluirViajeId,
  });
  if (vehiculoSolapado) {
    throw new ValidacionError({
      vehiculoId: 'El vehículo ya tiene un viaje programado que se superpone con este horario',
    });
  }

  return datos;
}

function serializarViaje(viaje) {
  return {
    id: viaje.id,
    choferId: viaje.choferId,
    chofer: viaje.chofer
      ? {
          id: viaje.chofer.id,
          nombre: viaje.chofer.nombre,
          apellido: viaje.chofer.apellido,
        }
      : undefined,
    vehiculoId: viaje.vehiculoId,
    vehiculo: viaje.vehiculo
      ? {
          id: viaje.vehiculo.id,
          dominio: viaje.vehiculo.dominio,
          numeroInterno: viaje.vehiculo.numeroInterno,
          marca: viaje.vehiculo.marca,
          modelo: viaje.vehiculo.modelo,
        }
      : undefined,
    fechaInicio: viaje.fechaInicio,
    fechaFin: viaje.fechaFin,
    kilometrosEstimados: viaje.kilometrosEstimados,
    estado: viaje.estadoViaje.descripcion,
    creadoEn: viaje.creadoEn,
  };
}

async function crearViaje({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const datos = await validarYArmarDatos({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados });

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const viaje = await prisma.viaje.create({
    data: {
      choferId: datos.choferId,
      vehiculoId: datos.vehiculoId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      kilometrosEstimados: datos.kilometrosEstimados,
      estadoViajeId: estadoProgramado.id,
    },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return serializarViaje(viaje);
}

class NoEncontradoError extends Error {}

// Estado distinto de PROGRAMADO: no se puede ni editar ni cancelar (salvo el
// caso de "ya cancelado", que tiene su propio error más específico abajo).
class EstadoNoEditableError extends Error {
  constructor(estadoActual) {
    super(`El viaje está en estado ${estadoActual}`);
    this.estadoActual = estadoActual;
  }
}

class YaCanceladoError extends Error {}

async function obtenerViaje(id) {
  const viaje = await prisma.viaje.findUnique({
    where: { id: Number(id) },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });
  if (!viaje) {
    throw new NoEncontradoError();
  }
  return viaje;
}

async function actualizarViaje(id, { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const datos = await validarYArmarDatos(
    { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
    { excluirViajeId: actual.id }
  );

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: {
      choferId: datos.choferId,
      vehiculoId: datos.vehiculoId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      kilometrosEstimados: datos.kilometrosEstimados,
    },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return serializarViaje(viaje);
}

async function cancelarViaje(id) {
  const actual = await obtenerViaje(id);

  if (actual.estadoViaje.descripcion === 'CANCELADO') {
    throw new YaCanceladoError();
  }
  if (actual.estadoViaje.descripcion !== 'PROGRAMADO') {
    throw new EstadoNoEditableError(actual.estadoViaje.descripcion);
  }

  const estadoCancelado = await obtenerEstadoViajePorDescripcion('CANCELADO');

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: { estadoViajeId: estadoCancelado.id },
    include: { chofer: true, vehiculo: true, estadoViaje: true },
  });

  return serializarViaje(viaje);
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

async function listarViajes({ estado, choferId, vehiculoId, fechaDesde, fechaHasta } = {}) {
  const where = {};

  if (estado && ESTADOS_VIAJE_VALIDOS.includes(estado)) {
    where.estadoViaje = { descripcion: estado };
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
    include: { chofer: true, vehiculo: true, estadoViaje: true },
    orderBy: { fechaInicio: 'asc' },
  });

  return viajes.map(serializarViaje);
}

module.exports = {
  crearViaje,
  listarViajes,
  actualizarViaje,
  cancelarViaje,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  YaCanceladoError,
  ESTADOS_VIAJE_VALIDOS,
};
