// Precio y pagos del viaje (al cliente y al chofer): catálogos, validación y actualización.
const prisma = require('../prismaClient');
// Fechas sin offset = hora de Córdoba (UTC-3 todo el año): ver utils/fechaCordoba.
const { aFechaCordoba } = require('../../utils/fechaCordoba');
const { ValidacionError } = require('./errores');
const { presente } = require('./validaciones');
const { INCLUDE_RELACIONES_VIAJE, serializarViaje, obtenerViaje } = require('./serializacion');

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

module.exports = {
  listarEstadosPago,
  listarMetodosPago,
  actualizarDatosAdministrativos,
};
