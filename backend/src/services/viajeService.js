const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');

const ESTADO_VEHICULO_HABILITADO = 'OPERATIVO';
const ESTADOS_VIAJE_VALIDOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Usado por cualquier lectura de viaje que vaya a pasar por serializarViaje
// (necesita las 10 relaciones resueltas: las 5 operativas de siempre más las
// 5 de datos administrativos agregadas en la tarea de Precio/Cliente/pagos).
const INCLUDE_RELACIONES_VIAJE = {
  chofer: true,
  vehiculo: true,
  estadoViaje: true,
  origen: true,
  destino: true,
  cliente: true,
  estadoPagoCliente: true,
  metodoPagoCliente: true,
  estadoPagoChofer: true,
  metodoPagoChofer: true,
};

// Gestores: pueden Comenzar/Finalizar cualquier viaje. El chofer asignado
// también puede, sobre SU PROPIO viaje, sin importar su perfil (cualquier
// usuario habilitado para conducir puede ser chofer, SCRUM-27) — por eso no
// alcanza con el `autorizar(...)` de rol que usan el resto de las rutas de
// gestión; este chequeo necesita el viaje cargado (conocer el choferId), así
// que vive acá en el service en vez de a nivel de ruta. Editar/Cancelar NO
// usan este helper: siguen siendo exclusivos de gestor.
const PERFILES_GESTORES_VIAJE = ['ADMINISTRADOR', 'ENCARGADO'];

function puedeOperarViaje(usuarioSolicitante, viaje) {
  return PERFILES_GESTORES_VIAJE.includes(usuarioSolicitante.perfil) || viaje.choferId === usuarioSolicitante.id;
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

class PermisoDenegadoError extends Error {}

// Se dispara al intentar Comenzar un viaje cuando el vehículo o el chofer ya
// tienen otro viaje En viaje en curso. El chequeo de acá adentro es best
// effort para dar un mensaje claro en el camino feliz; la garantía dura
// contra la carrera entre dos requests simultáneos es el índice único
// parcial de la base (Paso 1) — si esta validación pasa pero el INSERT/UPDATE
// igual choca contra ese índice, se captura el código 23505 (P2002 en
// Prisma) y se relanza como este mismo error, nunca como un error crudo de
// Postgres.
class ViajeEnCursoError extends Error {}

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

// Igual que aFechaCordoba, pero tolera recibir un Date ya parseado tal cual
// (lo devuelve sin tocar). Hace falta en `confirmarViaje`, que combina valores
// ya guardados en la base (que llegan como Date, vía Prisma) con los que
// puedan venir nuevos en el payload (que llegan como string crudo de HTTP) —
// sin esto, pasar un Date por aFechaCordoba lo convertiría a texto con
// `String(date)` y lo volvería a parsear mal.
function aFechaCordobaOInstancia(valor) {
  if (valor instanceof Date) return valor;
  return aFechaCordoba(valor);
}

// "Ahora" ya es un instante absoluto (Date es UTC puro internamente), así que
// no necesita ningún ajuste de zona horaria para compararse contra
// fechaInicio/fechaFin — esos valores ya quedaron guardados como instantes
// absolutos vía aFechaCordoba() al crear/editar el viaje. Se nombra aparte
// (en vez de usar `new Date()` suelto en cada lugar) para dejar explícito que
// esta comparación usa el mismo criterio de "hora de Córdoba" que el resto
// del archivo, no el reloj de quien esté mirando la pantalla (mismo bug que
// se corrigió en SCRUM-29).
function ahoraCordoba() {
  return new Date();
}

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

function campoAusente(valor) {
  return valor === undefined || valor === null || valor === '';
}

// clienteId/origenId/destinoId: dato "core" del viaje (quién lo pidió y
// adónde), no operativo — siempre obligatorios, en cualquier estado, tanto al
// crear como al editar (a diferencia de los 5 campos operativos de abajo, que
// dependen de si el viaje es A_CONFIRMAR o no). clienteId se sumó acá en esta
// tarea; antes vivía (por error de alcance) como uno de los 9 campos
// opcionales de datos-administrativos.
function validarCamposCore({ clienteId, origenId, destinoId }) {
  const errores = {};

  const clienteIdNumero = Number(clienteId);
  if (campoAusente(clienteId)) {
    errores.clienteId = 'El cliente es obligatorio';
  } else if (!Number.isInteger(clienteIdNumero) || clienteIdNumero <= 0) {
    errores.clienteId = 'El cliente elegido no es válido';
  }

  const origenIdNumero = Number(origenId);
  if (campoAusente(origenId)) {
    errores.origenId = 'El origen es obligatorio';
  } else if (!Number.isInteger(origenIdNumero) || origenIdNumero <= 0) {
    errores.origenId = 'El origen elegido no es válido';
  }

  const destinoIdNumero = Number(destinoId);
  if (campoAusente(destinoId)) {
    errores.destinoId = 'El destino es obligatorio';
  } else if (!Number.isInteger(destinoIdNumero) || destinoIdNumero <= 0) {
    errores.destinoId = 'El destino elegido no es válido';
  }

  if (!errores.origenId && !errores.destinoId && origenIdNumero === destinoIdNumero) {
    errores.destinoId = 'El destino no puede ser el mismo que el origen';
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(errores);
  }

  return { clienteId: clienteIdNumero, origenId: origenIdNumero, destinoId: destinoIdNumero };
}

// Los 5 campos operativos (quién maneja, qué vehículo, cuándo, cuántos km).
// `obligatorios` decide el modo:
//  - true: idéntico al validarDatos de siempre — los 5 son obligatorios,
//    mismos mensajes de error (usado al crear/editar con los 5 completos, al
//    editar un viaje PROGRAMADO, y al confirmar).
//  - false: un campo ausente no es error, simplemente resuelve a `null`
//    explícito (nunca `undefined` — actualizarViaje/crearViaje son reemplazo
//    completo, no actualización parcial, así que un campo que no vino tiene
//    que BORRARSE, no "dejarse como estaba"). Si el campo SÍ vino, igual se le
//    exige formato válido — la obligatoriedad se relaja, no la validación.
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
    if (obligatorios) errores.fechaInicio = 'La fecha y hora de inicio es obligatoria';
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

function todosLosCincoPresentes({ choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados }) {
  return [choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados].every((v) => !campoAusente(v));
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

// Existencia pura, sin elegibilidad de negocio (ACTIVO/habilitadoParaConducir
// para chofer, OPERATIVO para vehículo) — la versión liviana que usa el
// alta/edición de un viaje A_CONFIRMAR para los campos operativos que sí
// vengan presentes ("un vehiculoId dado tiene que ser un vehículo real", nada
// más, todavía no importa si está disponible).
async function validarExistenciaUsuario(id, campo) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) {
    throw new ValidacionError({ [campo]: 'El chofer elegido no existe' });
  }
  return usuario;
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

// Validación de negocio completa de los 5 campos operativos, YA bien
// formados y YA todos presentes (ver validarCamposOperativos con
// obligatorios:true antes de esto): chofer y vehículo habilitados, y sin
// solapamiento. Reusada por crearViaje (camino "los 5 completos"),
// actualizarViaje (edición de un viaje PROGRAMADO) y confirmarViaje — las
// tres rutas que necesitan la validación completa, nunca duplicada. En la
// edición/confirmación hay que excluir el propio viaje de la búsqueda de
// solapamiento (si no, siempre "chocaría" contra su propio horario actual).
async function validarDisponibilidadOperativa({ choferId, vehiculoId, fechaInicio, fechaFin }, { excluirViajeId } = {}) {
  await validarChofer(choferId);
  await validarVehiculo(vehiculoId);

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

// Valida clienteId/origenId/destinoId (siempre obligatorios, existencia en
// BD) — compartido por crearViaje y actualizarViaje, en cualquier estado.
async function validarYArmarCore({ clienteId, origenId, destinoId }) {
  const core = validarCamposCore({ clienteId, origenId, destinoId });

  await validarCliente(core.clienteId, 'clienteId');
  await validarUbicacion(core.origenId, 'origenId');
  await validarUbicacion(core.destinoId, 'destinoId');

  return core;
}

// Valida los 5 campos operativos en el modo que corresponda:
//  - `obligatorios: true` → los 5 tienen que estar y pasar la validación de
//    negocio completa (habilitación + solapamiento).
//  - `obligatorios: false` → los que vengan presentes solo se validan por
//    existencia (sin elegibilidad de negocio); los ausentes quedan en null.
// `excluirViajeId` solo importa en modo obligatorio (solapamiento).
async function validarYArmarOperativos(campos, { obligatorios, excluirViajeId } = {}) {
  const datos = validarCamposOperativos(campos, { obligatorios });

  if (obligatorios) {
    await validarDisponibilidadOperativa(datos, { excluirViajeId });
  } else {
    if (datos.choferId !== null) await validarExistenciaUsuario(datos.choferId, 'choferId');
    if (datos.vehiculoId !== null) await validarExistenciaVehiculo(datos.vehiculoId, 'vehiculoId');
  }

  return datos;
}

// Las 12 claves de datos administrativos de un viaje. Se OMITEN por completo
// (en vez de devolverse en null) para quien no puede verlas: un null diría
// "no se cargó nada" sobre un viaje que sí tiene precio cargado, que es un dato
// falso; ausente dice "esto no te corresponde". Los ids de las relaciones
// (estadoPagoClienteId, etc.) van en el mismo grupo porque también revelan el
// dato. precio/pagoChofer vienen de Prisma como Decimal (objeto), se convierten
// a number para que la API devuelva un número plano; las que no se cargaron
// van en null, nunca se omite la clave para un Administrador/Encargado.
function serializarDatosAdministrativos(viaje) {
  return {
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

// kmRealizados ya no sale de columnas propias del viaje (odometroInicial/
// odometroFinal quedaron deprecadas en el Paso 1): se busca la lectura
// INICIO_VIAJE y la FIN_VIAJE asociadas a este viaje y se resuelve cada una
// con obtenerLecturaVigente, por si alguna fue corregida después (todavía no
// hay forma de corregir desde HTTP, pero la función ya existe y el cálculo
// tiene que estar bien desde ya). Si falta cualquiera de las dos, null.
async function serializarViaje(viaje, usuarioSolicitante) {
  const [lecturaInicio, lecturaFin] = await Promise.all([
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'INICIO_VIAJE' } },
    }),
    prisma.lecturaOdometro.findFirst({
      where: { viajeId: viaje.id, origen: { descripcion: 'FIN_VIAJE' } },
    }),
  ]);

  let kmRealizados = null;
  if (lecturaInicio && lecturaFin) {
    const [vigenteInicio, vigenteFin] = await Promise.all([
      lecturaOdometroService.obtenerLecturaVigente(lecturaInicio.id),
      lecturaOdometroService.obtenerLecturaVigente(lecturaFin.id),
    ]);
    kmRealizados = vigenteFin.valorKm - vigenteInicio.valorKm;
  }

  const estado = viaje.estadoViaje.descripcion;
  const ahora = ahoraCordoba();
  // Indicadores derivados, no un estado nuevo: "vencido" (Programado que
  // nunca se comenzó) y "excedido" (En viaje que no se finalizó a tiempo) son
  // mutuamente excluyentes por construcción (dependen de estados distintos) y
  // van en false para Finalizado/Cancelado.
  const vencido = estado === 'PROGRAMADO' && viaje.fechaInicio < ahora;
  const excedido = estado === 'EN_VIAJE' && viaje.fechaFin < ahora;

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
        }
      : null,
    vehiculoId: viaje.vehiculoId,
    vehiculo: viaje.vehiculo
      ? {
          id: viaje.vehiculo.id,
          dominio: viaje.vehiculo.dominio,
          numeroInterno: viaje.vehiculo.numeroInterno,
          marca: viaje.vehiculo.marca,
          modelo: viaje.vehiculo.modelo,
          kilometraje: viaje.vehiculo.kilometraje,
        }
      : null,
    // origenId/destinoId y sus objetos resueltos van en null para viajes
    // históricos que no los tienen (no se inventa ni se omite la clave, ver
    // tarea de Origen/Destino).
    origenId: viaje.origenId,
    origen: viaje.origen ? { id: viaje.origen.id, nombre: viaje.origen.nombre } : null,
    destinoId: viaje.destinoId,
    destino: viaje.destino ? { id: viaje.destino.id, nombre: viaje.destino.nombre } : null,
    // Cliente es un dato core del viaje, visible para todos los perfiles.
    clienteId: viaje.clienteId,
    cliente: viaje.cliente ? { id: viaje.cliente.id, nombre: viaje.cliente.nombre } : null,
    // Datos administrativos: para Administrador/Encargado van las 12 claves
    // (los 8 campos más los id de las 4 relaciones); para el resto de los
    // perfiles NO viaja ninguna (se omiten, no se devuelven en null — ver
    // serializarDatosAdministrativos).
    ...(puedeVerDatosAdministrativos(usuarioSolicitante) ? serializarDatosAdministrativos(viaje) : {}),
    fechaInicio: viaje.fechaInicio,
    fechaFin: viaje.fechaFin,
    kilometrosEstimados: viaje.kilometrosEstimados,
    horaInicioReal: viaje.horaInicioReal,
    horaFinReal: viaje.horaFinReal,
    kmRealizados,
    // Nota operativa del viaje, cargada solo al finalizar: visible para cualquier
    // perfil que vea el viaje (no es un dato administrativo). null si no hay.
    observacionFinal: viaje.observacionFinal,
    estado,
    vencido,
    excedido,
    creadoEn: viaje.creadoEn,
  };
}

// Un solo endpoint, dos resultados posibles: si los 5 campos operativos
// vienen completos, comportamiento idéntico a como era antes de esta tarea
// (validación completa, PROGRAMADO). Si falta alguno, el viaje se crea
// A_CONFIRMAR con lo que sí vino (validado solo por existencia) y el resto en
// null. clienteId/origenId/destinoId son siempre obligatorios en los dos
// casos — no son parte de esta bifurcación.
async function crearViaje(
  { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados, clienteId, origenId, destinoId },
  usuarioSolicitante
) {
  const core = await validarYArmarCore({ clienteId, origenId, destinoId });

  const camposOperativos = { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados };
  const completo = todosLosCincoPresentes(camposOperativos);

  const operativos = await validarYArmarOperativos(camposOperativos, { obligatorios: completo });

  const estado = await obtenerEstadoViajePorDescripcion(completo ? 'PROGRAMADO' : 'A_CONFIRMAR');

  const viaje = await prisma.viaje.create({
    data: {
      choferId: operativos.choferId,
      vehiculoId: operativos.vehiculoId,
      fechaInicio: operativos.fechaInicio,
      fechaFin: operativos.fechaFin,
      kilometrosEstimados: operativos.kilometrosEstimados,
      clienteId: core.clienteId,
      origenId: core.origenId,
      destinoId: core.destinoId,
      estadoViajeId: estado.id,
    },
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return await serializarViaje(viaje, usuarioSolicitante);
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
    include: INCLUDE_RELACIONES_VIAJE,
  });
  if (!viaje) {
    throw new NoEncontradoError();
  }
  return viaje;
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
async function actualizarViaje(
  id,
  { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados, clienteId, origenId, destinoId },
  usuarioSolicitante
) {
  const actual = await obtenerViaje(id);
  const estadoActual = actual.estadoViaje.descripcion;

  if (estadoActual !== 'PROGRAMADO' && estadoActual !== 'A_CONFIRMAR') {
    throw new EstadoNoEditableError(estadoActual);
  }

  const core = await validarYArmarCore({ clienteId, origenId, destinoId });

  const modoCompleto = estadoActual === 'PROGRAMADO';
  const operativos = await validarYArmarOperativos(
    { choferId, vehiculoId, fechaInicio, fechaFin, kilometrosEstimados },
    { obligatorios: modoCompleto, excluirViajeId: actual.id }
  );

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: {
      choferId: operativos.choferId,
      vehiculoId: operativos.vehiculoId,
      fechaInicio: operativos.fechaInicio,
      fechaFin: operativos.fechaFin,
      kilometrosEstimados: operativos.kilometrosEstimados,
      clienteId: core.clienteId,
      origenId: core.origenId,
      destinoId: core.destinoId,
    },
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return await serializarViaje(viaje, usuarioSolicitante);
}

// Distingue "campo ausente" (no tocar) de "campo presente" — incluido el
// caso `null` explícito (borrar el dato).
function presente(payload, campo) {
  return Object.prototype.hasOwnProperty.call(payload, campo);
}

// Solo tiene sentido sobre un viaje A_CONFIRMAR (si no, 409). Combina lo que
// el viaje ya tenía guardado con lo que venga en el payload (el payload gana
// campo por campo, si está presente) y exige que el resultado tenga los 5
// completos — si no, 400 nombrando cuáles faltan, mismos mensajes que
// crear/editar en modo obligatorio. Con los 5 completos corre la MISMA
// validación de negocio que crearViaje/actualizarViaje (validarDisponibilidadOperativa
// — no se duplica) y, si pasa, pasa a PROGRAMADO.
class EstadoNoConfirmableError extends Error {
  constructor(estadoActual) {
    super(`El viaje está en estado ${estadoActual}`);
    this.estadoActual = estadoActual;
  }
}

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

  const estadoProgramado = await obtenerEstadoViajePorDescripcion('PROGRAMADO');

  const viaje = await prisma.viaje.update({
    where: { id: actual.id },
    data: {
      choferId: operativos.choferId,
      vehiculoId: operativos.vehiculoId,
      fechaInicio: operativos.fechaInicio,
      fechaFin: operativos.fechaFin,
      kilometrosEstimados: operativos.kilometrosEstimados,
      estadoViajeId: estadoProgramado.id,
    },
    include: INCLUDE_RELACIONES_VIAJE,
  });

  return await serializarViaje(viaje, usuarioSolicitante);
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

  // Ningún campo reconocido en el payload: no-op válido, no se toca la fila
  // (ni siquiera actualizadoEn).
  if (Object.keys(data).length === 0) {
    return serializarViaje(actual, usuarioSolicitante);
  }

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
    throw new ViajeEnCursoError('El vehículo ya tiene otro viaje En viaje en curso');
  }
  const choferEnViaje = await prisma.viaje.findFirst({
    where: { choferId: actual.choferId, estadoViajeId: estadoEnViaje.id },
  });
  if (choferEnViaje) {
    throw new ViajeEnCursoError('El chofer ya tiene otro viaje En viaje en curso');
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
      throw new ViajeEnCursoError('El vehículo o el chofer ya tienen otro viaje En viaje en curso');
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
async function listarViajes(
  { estado, choferId, vehiculoId, fechaDesde, fechaHasta, excluirAConfirmar = false } = {},
  usuarioSolicitante
) {
  const where = {};

  const filtroEstado = {};
  if (estado && ESTADOS_VIAJE_VALIDOS.includes(estado)) {
    filtroEstado.equals = estado;
  }
  if (excluirAConfirmar) {
    filtroEstado.not = 'A_CONFIRMAR';
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
    orderBy: { fechaInicio: { sort: 'desc', nulls: 'last' } },
  });

  return Promise.all(viajes.map((viaje) => serializarViaje(viaje, usuarioSolicitante)));
}

module.exports = {
  crearViaje,
  listarViajes,
  actualizarViaje,
  actualizarDatosAdministrativos,
  listarEstadosPago,
  listarMetodosPago,
  confirmarViaje,
  cancelarViaje,
  comenzarViaje,
  finalizarViaje,
  puedeOperarViaje,
  ValidacionError,
  NoEncontradoError,
  EstadoNoEditableError,
  EstadoNoConfirmableError,
  YaCanceladoError,
  PermisoDenegadoError,
  ViajeEnCursoError,
  ESTADOS_VIAJE_VALIDOS,
};
