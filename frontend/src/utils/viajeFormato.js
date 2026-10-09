// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.
import { fechaCordobaISO, hoyCordobaISO, sumarDiasFechaISO } from './fechaCordoba.js';

export function formatearFechaHora(valor) {
  // Se fuerza la zona horaria de Córdoba (la única en la que opera Adri-mar)
  // para que la hora mostrada no dependa de la zona horaria del navegador de
  // quien esté mirando la pantalla.
  return new Date(valor).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TZ_CORDOBA = 'America/Argentina/Cordoba';
const FORMATO_DIA_MES = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, day: '2-digit' });
const FORMATO_MES_CORTO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, month: 'short' });
const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ_CORDOBA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function diaYMes(fecha) {
  return `${FORMATO_DIA_MES.format(fecha)} ${FORMATO_MES_CORTO.format(fecha)}`;
}

// "05 oct 08:00" en hora de Córdoba: un solo instante, sin año, para espacios
// angostos donde la hora sola sería ambigua si el viaje cruza de día.
export function formatearDiaYHora(valor) {
  const fecha = new Date(valor);
  return `${diaYMes(fecha)} ${FORMATO_HORA.format(fecha)}`;
}

// "08:00" en hora de Córdoba.
export function formatearHora(valor) {
  return FORMATO_HORA.format(new Date(valor));
}

// Horario de un viaje para la tarjeta del listado y Próximos viajes, sin el día
// de inicio (ya lo dicen el bloque de fecha y el título del grupo):
// "07:30 – 10:00"; "22:00 – 11 oct 02:00" si el fin cae otro día (Córdoba);
// "07:30" si no hay fecha de fin.
export function formatearHorarioViaje(fechaInicio, fechaFin) {
  const inicio = formatearHora(fechaInicio);
  if (!fechaFin) return inicio;
  const fin = new Date(fechaFin);
  const mismoDia = fechaCordobaISO(fechaInicio) === fechaCordobaISO(fechaFin);
  return `${inicio} – ${mismoDia ? '' : `${diaMesSinPunto(fin)} `}${FORMATO_HORA.format(fin)}`;
}

// Algunos navegadores abrevian con punto ("oct.", "vie."): se saca para que
// todas las fechas cortas se escriban igual.
const sinPunto = (texto) => texto.replace(/\.$/, '');
const FORMATO_DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, weekday: 'short' });
const FORMATO_DIA_NUMERO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, day: 'numeric' });

function diaMesSinPunto(fecha) {
  return `${FORMATO_DIA_MES.format(fecha)} ${sinPunto(FORMATO_MES_CORTO.format(fecha))}`;
}

// Día (dos dígitos) y mes abreviado del bloque de fecha de las tarjetas de
// viaje y de Próximos viajes: { dia: '09', mes: 'oct' }, en hora de Córdoba.
export function partesFechaTile(valor) {
  const fecha = new Date(valor);
  return { dia: FORMATO_DIA_MES.format(fecha), mes: sinPunto(FORMATO_MES_CORTO.format(fecha)) };
}

// Título de un día en el listado de viajes agrupado: "Hoy · vie 9 oct",
// "Mañana · sáb 10 oct", "Ayer · jue 8 oct" o "mié 7 oct"; con el año solo si no
// es el año en curso ("lun 29 dic 2025"). Va en minúscula: el CSS lo pasa a
// mayúsculas. `diaISO` es un día calendario de Córdoba ("YYYY-MM-DD").
export function tituloDiaViajes(diaISO, ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  // Mediodía UTC del día: es el mismo día calendario en Córdoba (09:00).
  const fecha = new Date(`${diaISO}T12:00:00Z`);
  let texto = `${sinPunto(FORMATO_DIA_SEMANA.format(fecha))} ${FORMATO_DIA_NUMERO.format(fecha)} ${sinPunto(
    FORMATO_MES_CORTO.format(fecha)
  )}`;
  if (diaISO.slice(0, 4) !== hoy.slice(0, 4)) texto += ` ${diaISO.slice(0, 4)}`;

  const relativo = {
    [hoy]: 'Hoy',
    [sumarDiasFechaISO(hoy, 1)]: 'Mañana',
    [sumarDiasFechaISO(hoy, -1)]: 'Ayer',
  }[diaISO];
  return relativo ? `${relativo} · ${texto}` : texto;
}

// Hora de un viaje relativa a hoy (Córdoba), para la columna de horas del panel
// Viajes de hoy: "07:30" si es hoy, "ayer 22:00", "mañana 02:00", o
// "07 oct 22:00" para cualquier otro día.
export function formatearHoraRelativaHoy(valor, ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  const dia = fechaCordobaISO(valor);
  const hora = formatearHora(valor);
  if (dia === hoy) return hora;
  if (dia === sumarDiasFechaISO(hoy, -1)) return `ayer ${hora}`;
  if (dia === sumarDiasFechaISO(hoy, 1)) return `mañana ${hora}`;
  return `${diaMesSinPunto(new Date(valor))} ${hora}`;
}

// Kilómetros con separador de miles es-AR: 110030 -> "110.030".
export function formatearKm(valor) {
  return Number(valor).toLocaleString('es-AR');
}

export function nombreChofer(chofer) {
  return `${chofer.nombre} ${chofer.apellido}`;
}

export function nombreVehiculo(vehiculo) {
  return `${vehiculo.numeroInterno} - ${vehiculo.dominio}`;
}

// Montos en pesos argentinos (ej. "$ 1.234,50"). Los valores nulos los
// resuelve el caller (cada pantalla decide su propio placeholder).
export function formatearMonto(valor) {
  return Number(valor).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

// Solo la fecha (sin hora), en hora de Córdoba — para fechas de pago, que son
// un día calendario y no un instante.
export function formatearSoloFecha(valor) {
  return new Date(valor).toLocaleDateString('es-AR', {
    timeZone: TZ_CORDOBA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Los catálogos (EstadoPago/MetodoPago) se guardan en mayúsculas ("PAGADO");
// para mostrarlos al usuario se pasan a "Pagado".
export function capitalizarCatalogo(descripcion) {
  if (!descripcion) return '';
  return descripcion.charAt(0).toUpperCase() + descripcion.slice(1).toLowerCase();
}
