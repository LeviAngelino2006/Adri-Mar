import { diferenciaDiasCordoba, fechaCordobaISO } from './fechaCordoba';

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

// Formato compacto del rango de un viaje: "05 oct · 08:00 - 18:00" si
// empieza y termina el mismo día calendario (Córdoba), o
// "05 oct 08:00 → 06 oct 18:00" si cruza de día.
export function formatearRangoCompacto(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const mismoDia = fechaCordobaISO(fechaInicio) === fechaCordobaISO(fechaFin);

  if (mismoDia) {
    return `${diaYMes(inicio)} · ${FORMATO_HORA.format(inicio)} - ${FORMATO_HORA.format(fin)}`;
  }

  return `${diaYMes(inicio)} ${FORMATO_HORA.format(inicio)} → ${diaYMes(fin)} ${FORMATO_HORA.format(fin)}`;
}

// Igual que formatearRangoCompacto pero sin la fecha, solo el horario (para
// contextos donde la fecha ya se comunica por otro lado, como el badge de
// día relativo en "Tus próximos viajes" del Dashboard). Cuando cruza a un
// día calendario distinto (Córdoba) agrega un sufijo corto "(+N día/s)" en
// vez de la fecha completa, para no dejar ambiguo un viaje cuyo horario de
// inicio y fin coincide (ej. dura exactamente 24hs): sin esto, "23:10 →
// 23:10" se leería como si no durara nada.
export function formatearHorarioCompacto(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const diasDeDiferencia = diferenciaDiasCordoba(fechaInicio, fechaFin);
  const cruzaDias = diasDeDiferencia !== 0;
  const separador = cruzaDias ? '→' : '-';
  const sufijo = cruzaDias ? ` (+${diasDeDiferencia} día${diasDeDiferencia === 1 ? '' : 's'})` : '';

  return `${FORMATO_HORA.format(inicio)} ${separador} ${FORMATO_HORA.format(fin)}${sufijo}`;
}

export function nombreChofer(chofer) {
  return `${chofer.nombre} ${chofer.apellido}`;
}

export function nombreVehiculo(vehiculo) {
  return `${vehiculo.numeroInterno} - ${vehiculo.dominio}`;
}
