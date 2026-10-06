import { fechaCordobaISO } from './fechaCordoba';

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
