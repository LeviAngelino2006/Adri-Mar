// Adri-mar opera únicamente en Córdoba, Argentina (UTC-3 todo el año, sin
// horario de verano desde 2009), así que el offset se puede fijar así sin
// necesidad de una librería de zonas horarias. Mismo criterio que
// aFechaCordoba() en el backend (backend/src/services/viajeService.js).
const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;

// Convierte un timestamp ISO en UTC (como el que devuelve la API) al string
// "YYYY-MM-DDTHH:mm" que espera un <input type="datetime-local">, mostrando
// la hora de Córdoba y no la del navegador de quien esté editando.
export function aInputCordoba(fechaIso) {
  if (!fechaIso) return '';
  const instanteCordoba = new Date(new Date(fechaIso).getTime() - CORDOBA_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = instanteCordoba.getUTCFullYear();
  const mm = pad(instanteCordoba.getUTCMonth() + 1);
  const dd = pad(instanteCordoba.getUTCDate());
  const hh = pad(instanteCordoba.getUTCHours());
  const min = pad(instanteCordoba.getUTCMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Fecha de hoy ("YYYY-MM-DD") en hora de Córdoba, sin importar la zona
// horaria del navegador de quien esté mirando la pantalla. Mismo criterio de
// zona horaria que aFechaCordoba() en el backend: se usa para pedirle a la
// API viajes cuyo fechaInicio sea a partir de "hoy" en Córdoba, no en UTC.
const FORMATEADOR_FECHA_CORDOBA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hoyEnCordoba() {
  return FORMATEADOR_FECHA_CORDOBA.format(new Date());
}

// Fecha calendario ("YYYY-MM-DD") en hora de Córdoba de cualquier instante
// (no solo "hoy"), reusando el mismo formateador para no duplicar el cálculo
// de zona horaria.
export function fechaCordobaISO(fechaIso) {
  return FORMATEADOR_FECHA_CORDOBA.format(new Date(fechaIso));
}

// Diferencia en días de calendario (Córdoba) entre dos instantes cualquiera.
// Compara los componentes Y-M-D como UTC puro (no instantes), así el
// resultado no se ve afectado por la hora del día de cada extremo.
export function diferenciaDiasCordoba(fechaDesde, fechaHasta) {
  const [anio1, mes1, dia1] = fechaCordobaISO(fechaDesde).split('-').map(Number);
  const [anio2, mes2, dia2] = fechaCordobaISO(fechaHasta).split('-').map(Number);
  const utc1 = Date.UTC(anio1, mes1 - 1, dia1);
  const utc2 = Date.UTC(anio2, mes2 - 1, dia2);
  return Math.round((utc2 - utc1) / (24 * 60 * 60 * 1000));
}

// Diferencia en días de calendario (Córdoba) entre una fecha y "hoy".
export function diasDesdeHoyEnCordoba(fechaIso) {
  return diferenciaDiasCordoba(new Date(), fechaIso);
}

// Badge de día relativo ("Hoy"/"Mañana"/"En N días") para listados de
// viajes próximos. No distingue días pasados porque estos helpers solo se
// usan con viajes ya filtrados a partir de hoy.
export function etiquetaDiaRelativo(fechaIso) {
  const dias = diasDesdeHoyEnCordoba(fechaIso);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}
