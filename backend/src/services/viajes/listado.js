// Listado de viajes: vistas, filtros, búsqueda y orden.
const prisma = require('../prismaClient');
// Fechas sin offset = hora de Córdoba (UTC-3 todo el año): ver utils/fechaCordoba.
const { aFechaCordoba, rangoDelDiaCordoba } = require('../../utils/fechaCordoba');
const { normalizarNombre } = require('../../utils/normalizarNombre');
const { PermisoDenegadoError, ValidacionError } = require('./errores');
const { puedeVerDatosAdministrativos } = require('./permisos');
const { INCLUDE_RELACIONES_VIAJE, obtenerKmDeViajes } = require('./consultas');
const { FILTRO_ADMINISTRATIVO_PENDIENTE, serializarViaje } = require('./serializacion');

const ESTADOS_VIAJE_VALIDOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const SOLO_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
// `sinCerrar`. Sin `vista`: todos los estados, del más futuro al más viejo y
// sin `sinCerrar` (lo usan el Dashboard y otras pantallas).
//
// `q` busca por cliente o lugar (ver filtroBusqueda), también dentro de la vista.
//
// `excluirAConfirmar` lo usa /mis-viajes: excluye A_CONFIRMAR SIEMPRE. Si
// además se pide estado=A_CONFIRMAR, `equals` + `not` sobre el mismo valor es
// deliberadamente contradictorio: da una lista vacía en vez de un error o de
// ignorar el filtro.
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
    // nulls: 'last': los viajes sin fechaInicio van al final (Postgres por
    // defecto pone los NULL primero en DESC, tapando los reales). Con vista,
    // el id desempata para que el orden no cambie entre pedidos.
    orderBy: vistaValida ? ORDEN_VISTA[vistaValida] : { fechaInicio: { sort: 'desc', nulls: 'last' } },
  });

  // Las lecturas de odómetro de todos los viajes juntas: una cantidad de
  // consultas que no crece con el listado.
  const kmPorViaje = await obtenerKmDeViajes(viajes.map((viaje) => viaje.id));

  if (vistaValida !== 'proximos') {
    return viajes.map((viaje) => serializarViaje(viaje, usuarioSolicitante, kmPorViaje.get(viaje.id)));
  }

  // "Hoy" es el día de Córdoba: su inicio es las 00:00 de Córdoba.
  const { inicio: inicioDeHoy } = rangoDelDiaCordoba(new Date());
  return ordenarProximos(viajes, inicioDeHoy).map(({ viaje, sinCerrar }) => ({
    ...serializarViaje(viaje, usuarioSolicitante, kmPorViaje.get(viaje.id)),
    sinCerrar,
  }));
}

module.exports = {
  ESTADOS_VIAJE_VALIDOS,
  listarViajes,
};
