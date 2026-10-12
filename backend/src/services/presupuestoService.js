const prisma = require('./prismaClient');
const { normalizarNombre } = require('../utils/normalizarNombre');

// Presupuestos para clientes potenciales (SCRUM-159). No tienen relación con
// la gestión de viajes: solo reusan los catálogos de Cliente, Ubicacion y
// Vehiculo. No se editan ni se eliminan (no hay PUT ni DELETE): para cambiar
// algo se duplica desde el front, que crea uno nuevo.

// Alícuota que se guarda en cada presupuesto nuevo. No la manda el cliente: si
// algún día cambia, se cambia acá y los presupuestos viejos conservan la suya.
const ALICUOTA_IVA_VIGENTE = '10.50';

const DIAS_VALIDEZ_MIN = 1;
const DIAS_VALIDEZ_MAX = 365;
const LARGO_MAXIMO_FORMA_PAGO = 500;
// Decimal(12, 2): hasta 10 dígitos enteros.
const IMPORTE_MAXIMO = 9999999999.99;

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const IMPORTE_REGEX = /^\d+(\.\d{1,2})?$/;

const ESTADO_VEHICULO_DADO_DE_BAJA = 'DADO_DE_BAJA';

const SELECT_NOMBRE = { select: { id: true, nombre: true } };

const INCLUDE_LISTADO = {
  cliente: SELECT_NOMBRE,
  origen: SELECT_NOMBRE,
  destino: SELECT_NOMBRE,
};

const INCLUDE_DETALLE = {
  ...INCLUDE_LISTADO,
  creadoPor: { select: { id: true, nombre: true, apellido: true } },
  unidades: {
    orderBy: { orden: 'asc' },
    include: { vehiculo: { select: { id: true, numeroInterno: true, dominio: true } } },
  },
};

class ValidacionError extends Error {
  constructor(errores) {
    super('Datos inválidos');
    this.errores = errores;
  }
}

class NoEncontradoError extends Error {}

function campoAusente(valor) {
  return valor === undefined || valor === null || valor === '';
}

const ENTERO_MAXIMO = 2147483647; // INTEGER de Postgres

// Entero positivo, aceptando también el string que manda un <input>. Los
// booleanos se rechazan a propósito: Number(true) === 1. El tope evita que un
// id fuera de rango llegue a Postgres y termine en un 500.
function aEnteroPositivo(valor) {
  if (typeof valor === 'boolean') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 && numero <= ENTERO_MAXIMO ? numero : null;
}

// Fecha sin hora ("YYYY-MM-DD", como la manda un <input type="date">). Se
// guarda en una columna DATE, así que se arma a las 00:00 UTC: Prisma la
// devuelve igual y serializarFecha la vuelve a cortar sin corrimientos de zona.
// Rechaza fechas que no existen (2026-02-30), que new Date() correría de mes.
function aFechaSinHora(valor) {
  if (typeof valor !== 'string' || !FECHA_REGEX.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  return fecha;
}

// Importe en pesos con hasta 2 decimales. Se pasa a Prisma como string (nunca
// como Number) para no arrastrar imprecisión de punto flotante al Decimal.
function aImporte(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const texto = String(valor).trim();
  if (!IMPORTE_REGEX.test(texto)) return null;
  const numero = Number(texto);
  if (numero <= 0 || numero > IMPORTE_MAXIMO) return null;
  return numero.toFixed(2);
}

// Valida formato y tipos del payload sin tocar la base. Junta todos los
// errores por campo para que el 400 los traiga juntos.
function validarFormato(payload) {
  const errores = {};
  const datos = {};

  const fechaEmision = aFechaSinHora(payload.fechaEmision);
  if (campoAusente(payload.fechaEmision)) {
    errores.fechaEmision = 'La fecha de emisión es obligatoria';
  } else if (!fechaEmision) {
    errores.fechaEmision = 'La fecha de emisión no es una fecha válida';
  } else {
    datos.fechaEmision = fechaEmision;
  }

  for (const [campo, etiqueta] of [
    ['clienteId', 'El cliente'],
    ['origenId', 'El origen'],
    ['destinoId', 'El destino'],
  ]) {
    const id = aEnteroPositivo(payload[campo]);
    if (campoAusente(payload[campo])) {
      errores[campo] = `${etiqueta} es obligatorio`;
    } else if (!id) {
      errores[campo] = `${etiqueta} elegido no es válido`;
    } else {
      datos[campo] = id;
    }
  }
  if (datos.origenId && datos.destinoId && datos.origenId === datos.destinoId) {
    errores.destinoId = 'El destino no puede ser el mismo que el origen';
  }

  const fechaServicio = aFechaSinHora(payload.fechaServicio);
  if (campoAusente(payload.fechaServicio)) {
    errores.fechaServicio = 'La fecha del servicio es obligatoria';
  } else if (!fechaServicio) {
    errores.fechaServicio = 'La fecha del servicio no es una fecha válida';
  } else if (datos.fechaEmision && fechaServicio < datos.fechaEmision) {
    errores.fechaServicio = 'La fecha del servicio no puede ser anterior a la fecha de emisión';
  } else {
    datos.fechaServicio = fechaServicio;
  }

  // Vacío o solo espacios = "A confirmar" (null), igual que si no viene.
  const horaSalida = typeof payload.horaSalida === 'string' ? payload.horaSalida.trim() : payload.horaSalida;
  if (campoAusente(horaSalida)) {
    datos.horaSalida = null;
  } else if (typeof horaSalida !== 'string' || !HORA_REGEX.test(horaSalida)) {
    errores.horaSalida = 'El horario de salida debe tener el formato HH:mm';
  } else {
    datos.horaSalida = horaSalida;
  }

  const pasajeros = aEnteroPositivo(payload.cantidadPasajeros);
  if (campoAusente(payload.cantidadPasajeros)) {
    errores.cantidadPasajeros = 'La cantidad de pasajeros es obligatoria';
  } else if (!pasajeros) {
    errores.cantidadPasajeros = 'La cantidad de pasajeros debe ser un número entero mayor a 0';
  } else {
    datos.cantidadPasajeros = pasajeros;
  }

  const importe = aImporte(payload.importeNeto);
  if (campoAusente(payload.importeNeto)) {
    errores.importeNeto = 'El importe es obligatorio';
  } else if (!importe) {
    errores.importeNeto = 'El importe debe ser un número mayor a 0, con hasta 2 decimales';
  } else {
    datos.importeNeto = importe;
  }

  if (payload.conFactura === undefined) {
    datos.conFactura = false;
  } else if (typeof payload.conFactura !== 'boolean') {
    errores.conFactura = 'Indicá si el presupuesto es con factura o con recibo';
  } else {
    datos.conFactura = payload.conFactura;
  }

  const formaPago = typeof payload.formaPago === 'string' ? payload.formaPago.trim() : '';
  if (typeof payload.formaPago !== 'string' && !campoAusente(payload.formaPago)) {
    errores.formaPago = 'La forma de pago no es válida';
  } else if (!formaPago) {
    errores.formaPago = 'La forma de pago es obligatoria';
  } else if (formaPago.length > LARGO_MAXIMO_FORMA_PAGO) {
    errores.formaPago = `La forma de pago no puede superar los ${LARGO_MAXIMO_FORMA_PAGO} caracteres`;
  } else {
    datos.formaPago = formaPago;
  }

  const dias = typeof payload.diasValidez === 'boolean' ? NaN : Number(payload.diasValidez);
  if (campoAusente(payload.diasValidez)) {
    errores.diasValidez = 'La validez es obligatoria';
  } else if (!Number.isInteger(dias) || dias < DIAS_VALIDEZ_MIN || dias > DIAS_VALIDEZ_MAX) {
    errores.diasValidez = `La validez debe ser un número entero de días entre ${DIAS_VALIDEZ_MIN} y ${DIAS_VALIDEZ_MAX}`;
  } else {
    datos.diasValidez = dias;
  }

  const { vehiculoIds } = payload;
  if (!Array.isArray(vehiculoIds) || vehiculoIds.length === 0) {
    errores.vehiculoIds = 'Elegí al menos una unidad';
  } else {
    const ids = vehiculoIds.map(aEnteroPositivo);
    if (ids.some((id) => id === null)) {
      errores.vehiculoIds = 'Alguna unidad elegida no es válida';
    } else if (new Set(ids).size !== ids.length) {
      errores.vehiculoIds = 'No se puede elegir la misma unidad más de una vez';
    } else {
      datos.vehiculoIds = ids;
    }
  }

  return { datos, errores };
}

// Texto que sale en el PDF por cada unidad. Se guarda como snapshot (ver
// PresupuestoUnidad en schema.prisma).
function describirUnidad(vehiculo) {
  return `${vehiculo.tipoVehiculo.descripcion} de ${vehiculo.asientos} pasajeros`;
}

// Existencia de cliente, origen y destino, y que los vehículos existan y no
// estén dados de baja (los EN_TALLER se aceptan: el servicio es a futuro).
// Devuelve los vehículos en el mismo orden que vehiculoIds.
async function validarReferencias(tx, datos) {
  const errores = {};

  const [cliente, origen, destino, vehiculos] = await Promise.all([
    datos.clienteId ? tx.cliente.findUnique({ where: { id: datos.clienteId } }) : null,
    datos.origenId ? tx.ubicacion.findUnique({ where: { id: datos.origenId } }) : null,
    datos.destinoId ? tx.ubicacion.findUnique({ where: { id: datos.destinoId } }) : null,
    datos.vehiculoIds
      ? tx.vehiculo.findMany({
          where: { id: { in: datos.vehiculoIds } },
          include: { tipoVehiculo: true, estadoVehiculo: true },
        })
      : [],
  ]);

  if (datos.clienteId && !cliente) errores.clienteId = 'El cliente elegido no existe';
  if (datos.origenId && !origen) errores.origenId = 'El origen elegido no existe';
  if (datos.destinoId && !destino) errores.destinoId = 'El destino elegido no existe';

  const porId = new Map(vehiculos.map((v) => [v.id, v]));
  const ordenados = (datos.vehiculoIds || []).map((id) => porId.get(id));
  if (ordenados.some((v) => !v)) {
    errores.vehiculoIds = 'Alguna unidad elegida no existe';
  } else if (ordenados.some((v) => v.estadoVehiculo.descripcion === ESTADO_VEHICULO_DADO_DE_BAJA)) {
    const internos = ordenados
      .filter((v) => v.estadoVehiculo.descripcion === ESTADO_VEHICULO_DADO_DE_BAJA)
      .map((v) => v.numeroInterno);
    errores.vehiculoIds = `Las unidades dadas de baja no se pueden presupuestar (interno ${internos.join(', ')})`;
  }

  return { errores, vehiculos: ordenados };
}

function serializarFecha(fecha) {
  return fecha ? new Date(fecha).toISOString().slice(0, 10) : null;
}

// Los Decimal de Prisma se devuelven como string con 2 decimales fijos
// ("420000.00", "10.50"): el front los convierte de forma explícita a
// centavos enteros (ver calcularImportes), nunca con parseFloat suelto.
function serializarDecimal(valor) {
  return valor == null ? null : valor.toFixed(2);
}

function serializarListado(p) {
  return {
    id: p.id,
    fechaEmision: serializarFecha(p.fechaEmision),
    cliente: p.cliente,
    origen: p.origen,
    destino: p.destino,
    fechaServicio: serializarFecha(p.fechaServicio),
    importeNeto: serializarDecimal(p.importeNeto),
    conFactura: p.conFactura,
    alicuotaIva: serializarDecimal(p.alicuotaIva),
    creadoEn: p.creadoEn,
  };
}

function serializarDetalle(p) {
  return {
    ...serializarListado(p),
    horaSalida: p.horaSalida,
    cantidadPasajeros: p.cantidadPasajeros,
    formaPago: p.formaPago,
    diasValidez: p.diasValidez,
    creadoPor: p.creadoPor,
    unidades: p.unidades.map((u) => ({
      id: u.id,
      vehiculoId: u.vehiculoId,
      descripcion: u.descripcion,
      orden: u.orden,
      vehiculo: u.vehiculo,
    })),
  };
}

async function crearPresupuesto(payload = {}, usuarioSolicitante) {
  const { datos, errores: erroresFormato } = validarFormato(payload);

  // Las lecturas de referencia y el alta van en la misma transacción: la
  // descripción snapshot sale de los mismos datos del vehículo que se validaron.
  const id = await prisma.$transaction(async (tx) => {
    const { errores: erroresReferencias, vehiculos } = await validarReferencias(tx, datos);
    // Un error de formato pisa al de existencia del mismo campo (es más útil).
    const errores = { ...erroresReferencias, ...erroresFormato };
    if (Object.keys(errores).length > 0) {
      throw new ValidacionError(errores);
    }

    const { vehiculoIds, ...campos } = datos;
    const creado = await tx.presupuesto.create({
      data: {
        ...campos,
        alicuotaIva: ALICUOTA_IVA_VIGENTE,
        creadoPorId: usuarioSolicitante.id,
        unidades: {
          create: vehiculos.map((vehiculo, indice) => ({
            vehiculoId: vehiculo.id,
            descripcion: describirUnidad(vehiculo),
            orden: indice + 1,
          })),
        },
      },
    });
    return creado.id;
  });

  return obtenerPresupuesto(id);
}

// Búsqueda por cliente contra nombreNormalizado, igual que clienteService:
// ignora mayúsculas y acentos ("rio" encuentra "Río Tercero SA").
async function listarPresupuestos({ cliente } = {}) {
  const texto = normalizarNombre(cliente);
  const presupuestos = await prisma.presupuesto.findMany({
    where: texto ? { cliente: { nombreNormalizado: { contains: texto } } } : undefined,
    include: INCLUDE_LISTADO,
    orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
  });
  return presupuestos.map(serializarListado);
}

async function obtenerPresupuesto(id) {
  const numero = aEnteroPositivo(id);
  const presupuesto = numero
    ? await prisma.presupuesto.findUnique({ where: { id: numero }, include: INCLUDE_DETALLE })
    : null;
  if (!presupuesto) {
    throw new NoEncontradoError();
  }
  return serializarDetalle(presupuesto);
}

module.exports = {
  crearPresupuesto,
  listarPresupuestos,
  obtenerPresupuesto,
  describirUnidad,
  ALICUOTA_IVA_VIGENTE,
  ValidacionError,
  NoEncontradoError,
};
