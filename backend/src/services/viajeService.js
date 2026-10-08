const prisma = require('./prismaClient');
const lecturaOdometroService = require('./lecturaOdometroService');

const ESTADO_VEHICULO_HABILITADO = 'OPERATIVO';
const ESTADOS_VIAJE_VALIDOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Usado por cualquier lectura de viaje que vaya a pasar por serializarViaje
// (necesita las 10 relaciones resueltas: las 5 operativas de siempre más las
// 5 de datos administrativos agregadas en la tarea de Precio/Cliente/pagos,
// y los candidatos). Los candidatos se cargan siempre, aunque
// serializarViaje los omita para quien no es gestor: son tablas chicas y así
// ninguna lectura puede olvidarse de incluirlos.
const INCLUDE_RELACIONES_VIAJE = {
  choferesCandidatos: { include: { usuario: true } },
  vehiculosCandidatos: { include: { vehiculo: true } },
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
//  - true: los 5 son obligatorios, mismos mensajes de error de siempre (usado
//    al editar un viaje PROGRAMADO y al confirmar).
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
  if (chofer.estadoUsuario.descripcion !== 'ACTIVO') return PROBLEMA_CHOFER.INACTIVO;
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
  const chofer = await prisma.usuario.findUnique({
    where: { id: choferId },
    include: { estadoUsuario: true },
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

// Validación de negocio completa de los 5 campos operativos, YA bien
// formados y YA todos presentes (ver validarCamposOperativos con
// obligatorios:true antes de esto): chofer y vehículo habilitados, y sin
// solapamiento. La usan actualizarViaje (edición de un viaje PROGRAMADO) y
// confirmarViaje — crearViaje ya NO: todo viaje nace A_CONFIRMAR, así que
// esta validación recién corre al confirmar. Hay que excluir el propio viaje
// de la búsqueda de solapamiento (si no, siempre "chocaría" contra su propio
// horario actual).
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
//    existencia (sin elegibilidad de negocio); los ausentes quedan en null
//    (salvo fechaInicio, que es obligatoria siempre).
// `excluirViajeId` solo importa en modo obligatorio (solapamiento).
// `erroresPrevios` son errores de formato de otros campos del mismo payload
// (hoy, cantidadPasajeros) que ya se detectaron: se juntan con los de formato
// de los operativos para que un único 400 los traiga a todos. Las validaciones
// contra la base (existencia, disponibilidad) solo corren si el formato de
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

function serializarCandidatos(viaje) {
  return {
    choferesCandidatos: (viaje.choferesCandidatos ?? []).map(({ usuario }) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
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
    const encontrados = await prisma.usuario.findMany({ where: { id: { in: choferes } }, select: { id: true } });
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

// Errores previos de un viaje A_CONFIRMAR (create/edit): asignado suelto o
// candidatos con mal formato. Se juntan con los de los campos operativos.
function erroresCandidatosAConfirmar({ choferId, vehiculoId }, candidatos) {
  const errores = { ...candidatos.errores };
  if (!campoAusente(choferId)) errores.choferId = ERROR_ASIGNADO_EN_A_CONFIRMAR;
  if (!campoAusente(vehiculoId)) errores.vehiculoId = ERROR_ASIGNADO_EN_A_CONFIRMAR;
  return errores;
}

// Todo viaje nace A_CONFIRMAR, vengan o no los 5 campos operativos: el
// encargado primero anota el viaje y recién después lo confirma. El único
// camino a PROGRAMADO es `confirmarViaje`, que es donde corre la validación de
// disponibilidad (habilitación + solapamiento). choferId/vehiculoId quedan en
// null: en su lugar van las listas de candidatos (choferesCandidatos /
// vehiculosCandidatos). clienteId/origenId/destinoId y fechaInicio son siempre
// obligatorios.
//
// `datosAdministrativos` es opcional (solo lo manda el formulario de alta de
// Administrador/Encargado): se valida con las mismas reglas que el PATCH
// /:id/datos-administrativos y se guarda en el MISMO create, así el viaje se
// crea con todo o no se crea, sin quedar a medias si esos datos son inválidos.
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
    clienteId,
    origenId,
    destinoId,
    datosAdministrativos,
  },
  usuarioSolicitante
) {
  const core = await validarYArmarCore({ clienteId, origenId, destinoId });

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
      },
    }
  );
  await validarExistenciaCandidatos(candidatos);

  const administrativos = await validarYArmarDatosAdministrativosOpcionales(datosAdministrativos);

  const estado = await obtenerEstadoViajePorDescripcion('A_CONFIRMAR');

  const viaje = await prisma.viaje.create({
    data: {
      ...administrativos,
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
      choferesCandidatos: { create: candidatos.choferes.map((usuarioId) => ({ usuarioId })) },
      vehiculosCandidatos: { create: candidatos.vehiculos.map((vehiculoId) => ({ vehiculoId })) },
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
//
// Según el estado actual el viaje se asigna de una de dos maneras:
//  - PROGRAMADO: 1 chofer y 1 vehículo, validación completa. Los candidatos no
//    aplican (si vienen no vacíos, 400).
//  - A_CONFIRMAR: choferId/vehiculoId sueltos no se aceptan (400); se usan las
//    listas de candidatos, que se REEMPLAZAN por completo (deleteMany +
//    createMany) junto con el update del viaje, todo en una transacción.
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

  const core = await validarYArmarCore({ clienteId, origenId, destinoId });

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
    const erroresPrevios = { ...pasajeros.errores, ...candidatos.errores };
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

    const viaje = await prisma.viaje.update({
      where: { id: actual.id },
      data: { ...datosViaje, ...operativos },
      include: INCLUDE_RELACIONES_VIAJE,
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
      },
    }
  );
  await validarExistenciaCandidatos(candidatos);

  const viaje = await prisma.$transaction(async (tx) => {
    // Reemplazo completo de las dos listas + update del viaje: si cualquier
    // paso falla no queda el viaje con candidatos a medio cambiar.
    await tx.viajeChoferCandidato.deleteMany({ where: { viajeId: actual.id } });
    await tx.viajeVehiculoCandidato.deleteMany({ where: { viajeId: actual.id } });
    if (candidatos.choferes.length > 0) {
      await tx.viajeChoferCandidato.createMany({
        data: candidatos.choferes.map((usuarioId) => ({ viajeId: actual.id, usuarioId })),
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

// Distingue "campo ausente" (no tocar) de "campo presente" — incluido el
// caso `null` explícito (borrar el dato).
function presente(payload, campo) {
  return Object.prototype.hasOwnProperty.call(payload, campo);
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
  if (problema === PROBLEMA_CHOFER.INACTIVO) return 'Usuario dado de baja';
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

  const [usuarios, vehiculos] = await Promise.all([
    choferIds.length > 0
      ? prisma.usuario.findMany({ where: { id: { in: choferIds } }, include: { estadoUsuario: true } })
      : [],
    vehiculoIds.length > 0
      ? prisma.vehiculo.findMany({ where: { id: { in: vehiculoIds } }, include: { estadoVehiculo: true } })
      : [],
  ]);

  async function evaluar({ id, entidad, campo, motivoDeHabilitacion }) {
    if (!entidad) return { id, disponible: false, motivo: 'No encontrado' };

    const motivoHabilitacion = motivoDeHabilitacion(entidad);
    if (motivoHabilitacion) return { id, disponible: false, motivo: motivoHabilitacion };

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

  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u]));
  const vehiculosPorId = new Map(vehiculos.map((v) => [v.id, v]));

  const [choferes, resultadoVehiculos] = await Promise.all([
    Promise.all(
      choferIds.map((id) =>
        evaluar({ id, entidad: usuariosPorId.get(id), campo: 'choferId', motivoDeHabilitacion: motivoDeChofer })
      )
    ),
    Promise.all(
      vehiculoIds.map((id) =>
        evaluar({ id, entidad: vehiculosPorId.get(id), campo: 'vehiculoId', motivoDeHabilitacion: motivoDeVehiculo })
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

  let choferIds = actual.choferesCandidatos.map((c) => c.usuarioId);
  let vehiculoIds = actual.vehiculosCandidatos.map((c) => c.vehiculoId);

  if (todos) {
    const [usuarios, vehiculos] = await Promise.all([
      prisma.usuario.findMany({
        where: { habilitadoParaConducir: true, estadoUsuario: { descripcion: 'ACTIVO' } },
        select: { id: true },
      }),
      prisma.vehiculo.findMany({
        where: { estadoVehiculo: { descripcion: { not: 'DADO_DE_BAJA' } } },
        select: { id: true },
      }),
    ]);
    choferIds = sinRepetidos([...choferIds, ...usuarios.map((u) => u.id)]);
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
// ausente no entra en `data`; `null` explícito sí, para borrar el dato). La usan
// actualizarDatosAdministrativos (PATCH) y crearViaje (alta con datos
// administrativos), para que las dos rutas validen exactamente igual. Lanza
// ValidacionError con los errores por campo; no toca la base.
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

// Variante para el alta de un viaje: `datosAdministrativos` puede no venir
// (undefined/null: no hay nada que guardar, devuelve {}), pero si viene tiene
// que ser un objeto.
async function validarYArmarDatosAdministrativosOpcionales(datos) {
  if (datos === undefined || datos === null) return {};
  if (typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ValidacionError({ datosAdministrativos: 'Los datos administrativos no son válidos' });
  }
  return validarYArmarDatosAdministrativos(datos);
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
  disponibilidadDeViaje,
  disponibilidadParaAlta,
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
