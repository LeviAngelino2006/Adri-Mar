import { hoyCordobaISO, sumarDiasFechaISO } from './fechaCordoba.js';
import { coincideBusquedaVehiculo } from './mantenimiento.js';
import { ordenarPorInterno } from './vehiculos.js';
import { formatearFechaCorta, formatearKm } from './viajeFormato.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MAX_DIAS_PERIODO = 366;
const SOLO_DIA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parsearDiaUTC(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

export function esFechaISOValida(valor) {
  if (typeof valor !== 'string' || !SOLO_DIA_REGEX.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// Lunes a domingo de la semana calendario actual en hora de Córdoba (UTC-3).
export function rangoSemanaActual(ahora = Date.now()) {
  const hoyISO = hoyCordobaISO(ahora);
  const [anio, mes, dia] = hoyISO.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const desde = sumarDiasFechaISO(hoyISO, offsetLunes);
  const hasta = sumarDiasFechaISO(desde, 6);
  return { desde, hasta };
}

export function rangoSemanaAnterior(ahora = Date.now()) {
  const actual = rangoSemanaActual(ahora);
  return {
    desde: sumarDiasFechaISO(actual.desde, -7),
    hasta: sumarDiasFechaISO(actual.hasta, -7),
  };
}

export function rangoMesActual(ahora = Date.now()) {
  const hoyISO = hoyCordobaISO(ahora);
  const [anio, mes] = hoyISO.split('-').map(Number);
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}

export function detectarPresetPeriodo(desde, hasta, ahora = Date.now()) {
  const semanaActual = rangoSemanaActual(ahora);
  if (desde === semanaActual.desde && hasta === semanaActual.hasta) return 'semana_actual';
  const semanaAnterior = rangoSemanaAnterior(ahora);
  if (desde === semanaAnterior.desde && hasta === semanaAnterior.hasta) return 'semana_anterior';
  const mesActual = rangoMesActual(ahora);
  if (desde === mesActual.desde && hasta === mesActual.hasta) return 'mes_actual';
  return 'personalizado';
}

export function validarRangoPeriodo(desde, hasta) {
  if (!esFechaISOValida(desde) || !esFechaISOValida(hasta)) {
    return 'Elegí fecha desde y hasta.';
  }
  if (desde > hasta) {
    return 'La fecha hasta no puede ser anterior a desde.';
  }
  const diasInclusivos = Math.round((parsearDiaUTC(hasta) - parsearDiaUTC(desde)) / MS_POR_DIA) + 1;
  if (diasInclusivos > MAX_DIAS_PERIODO) {
    return `El período no puede superar los ${MAX_DIAS_PERIODO} días.`;
  }
  return '';
}

// Formatea "YYYY-MM-DD" en hora de Córdoba ("16 nov 2026 – 22 nov 2026").
export function formatearRangoPeriodo(desde, hasta) {
  if (!esFechaISOValida(desde) || !esFechaISOValida(hasta)) return 'No registrado';
  const desdeTexto = formatearFechaCorta(`${desde}T12:00:00-03:00`);
  const hastaTexto = formatearFechaCorta(`${hasta}T12:00:00-03:00`);
  return desde === hasta ? desdeTexto : `${desdeTexto} – ${hastaTexto}`;
}

export function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return 'No registrado';
  const num = Number(valor);
  return num.toLocaleString('es-AR', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export function formatearDesvio(desvioPorcentaje, desvioKm) {
  if (desvioPorcentaje === null || desvioPorcentaje === undefined || desvioKm === null || desvioKm === undefined) {
    return 'No registrado';
  }
  const prefijoPct = desvioPorcentaje > 0 ? '+' : desvioPorcentaje < 0 ? '-' : '';
  const absPct = Math.abs(desvioPorcentaje);
  const textoPct = absPct.toLocaleString('es-AR', {
    minimumFractionDigits: Number.isInteger(absPct) ? 0 : 1,
    maximumFractionDigits: 1,
  });
  const prefijoKm = desvioKm > 0 ? '+' : desvioKm < 0 ? '-' : '';
  const textoKm = formatearKm(Math.abs(desvioKm));
  return `${prefijoPct}${textoPct} % (${prefijoKm}${textoKm} km)`;
}

export function filtrarVehiculosReporte(items, { busqueda = '', tipoVehiculoId = '', incluirSinViajes = true } = {}) {
  return items.filter(
    (item) =>
      coincideBusquedaVehiculo(item.vehiculo, busqueda) &&
      (!tipoVehiculoId || String(item.vehiculo.tipoVehiculoId) === String(tipoVehiculoId)) &&
      (incluirSinViajes || item.cantidadViajes > 0)
  );
}

export const AYUDA_DESVIO =
  'Compara los km reales del odómetro contra los km estimados al planificar cada viaje. Positivo indica que se recorrió más de lo estimado.';

export const ORDENES_REPORTE_KM = [
  { value: 'km_desc', label: 'Más km recorridos' },
  { value: 'viajes_desc', label: 'Más viajes' },
  { value: 'interno_asc', label: 'Número de interno' },
  { value: 'desvio_desc', label: 'Mayor desvío vs. estimado' },
];

export function ordenarVehiculosReporte(items, orden = 'km_desc') {
  const ordenadosInterno = ordenarPorInterno(items.map((item) => item.vehiculo));
  const posicionInterno = new Map(ordenadosInterno.map((v, idx) => [v.id, idx]));
  const porInterno = (a, b) => (posicionInterno.get(a.vehiculo.id) ?? 0) - (posicionInterno.get(b.vehiculo.id) ?? 0);

  const comparadores = {
    km_desc: (a, b) => b.kmRecorridos - a.kmRecorridos || b.cantidadViajes - a.cantidadViajes || porInterno(a, b),
    viajes_desc: (a, b) => b.cantidadViajes - a.cantidadViajes || b.kmRecorridos - a.kmRecorridos || porInterno(a, b),
    interno_asc: porInterno,
    desvio_desc: (a, b) => {
      const tieneA = a.desvioPorcentaje != null;
      const tieneB = b.desvioPorcentaje != null;
      if (tieneA !== tieneB) return tieneA ? -1 : 1;
      if (tieneA && tieneB && b.desvioPorcentaje !== a.desvioPorcentaje) {
        return b.desvioPorcentaje - a.desvioPorcentaje;
      }
      return porInterno(a, b);
    },
  };

  return [...items].sort(comparadores[orden] ?? comparadores.km_desc);
}

export function nombreArchivoReportePdf(desde, hasta) {
  return `Reporte km por vehiculo - ${desde} a ${hasta}.pdf`;
}

export function partirTokenPdf(palabra, maxCaracteres = 10) {
  if (!palabra || palabra.length <= maxCaracteres) return [palabra];

  const bloques = [];
  for (const segmento of palabra.split(/(?<=[-/])/).filter(Boolean)) {
    for (let i = 0; i < segmento.length; i += maxCaracteres) {
      bloques.push(segmento.slice(i, i + maxCaracteres));
    }
  }

  return bloques.flatMap((parte, idx) => (idx === 0 ? [parte] : ['', parte]));
}

const TZ_CORDOBA = 'America/Argentina/Cordoba';
const sinPunto = (texto) => texto.replace(/\.$/, '');
const FORMATO_DIA_SEMANA_CORTO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, weekday: 'short' });
const FORMATO_DIA_NUM = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, day: 'numeric' });
const FORMATO_MES_CORTO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, month: 'short' });
const FORMATO_MES_LARGO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, month: 'long' });
const FORMATO_ANIO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, year: 'numeric' });

export function etiquetaPuntoSerie(punto, granularidad, totalPuntos = 7) {
  if (!punto?.desde || !esFechaISOValida(punto.desde)) return '';
  const fecha = new Date(`${punto.desde}T12:00:00-03:00`);
  if (granularidad === 'mes') {
    return `${sinPunto(FORMATO_MES_CORTO.format(fecha))} ${FORMATO_ANIO.format(fecha).slice(-2)}`;
  }
  if (granularidad === 'dia' && totalPuntos <= 10) {
    return `${sinPunto(FORMATO_DIA_SEMANA_CORTO.format(fecha))} ${FORMATO_DIA_NUM.format(fecha)}`;
  }
  return `${FORMATO_DIA_NUM.format(fecha)} ${sinPunto(FORMATO_MES_CORTO.format(fecha))}`;
}

export function tituloPuntoSerie(punto, granularidad) {
  if (!punto?.desde || !esFechaISOValida(punto.desde)) return 'No registrado';
  if (granularidad === 'mes') {
    const fecha = new Date(`${punto.desde}T12:00:00-03:00`);
    const mes = FORMATO_MES_LARGO.format(fecha);
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${FORMATO_ANIO.format(fecha)}`;
  }
  if (granularidad === 'semana' && punto.hasta) {
    return formatearRangoPeriodo(punto.desde, punto.hasta);
  }
  return formatearFechaCorta(`${punto.desde}T12:00:00-03:00`);
}

const MULTIPLICADORES_ESCALA = [1, 2, 2.5, 3, 5, 10];

export function calcularEscalaEjeY(maximo) {
  const valorMax = Number.isFinite(maximo) && maximo > 0 ? maximo : 0;
  if (valorMax <= 1) return { techo: 1, marcas: [1, 0] };
  if (valorMax <= 3) {
    const techo = Math.ceil(valorMax);
    const marcas = [];
    for (let v = techo; v >= 0; v -= 1) marcas.push(v);
    return { techo, marcas };
  }

  const pasos = 3;
  const pasoMinimo = valorMax / pasos;
  const magnitud = 10 ** Math.floor(Math.log10(pasoMinimo));
  let paso = 10 * magnitud;

  for (const mult of MULTIPLICADORES_ESCALA) {
    const candidato = mult * magnitud;
    if (Number.isInteger(candidato) && candidato >= pasoMinimo) {
      paso = candidato;
      break;
    }
  }

  const techo = paso * pasos;
  return { techo, marcas: [techo, paso * 2, paso, 0] };
}
