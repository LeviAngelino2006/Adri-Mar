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

// Formateador de fecha calendario ("YYYY-MM-DD") en hora de Córdoba, sin
// importar la zona horaria del navegador de quien esté mirando la pantalla.
// Mismo criterio de zona horaria que aFechaCordoba() en el backend.
const FORMATEADOR_FECHA_CORDOBA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Fecha calendario ("YYYY-MM-DD") en hora de Córdoba de cualquier instante
// (no solo "hoy"), reusando el mismo formateador para no duplicar el cálculo
// de zona horaria.
export function fechaCordobaISO(fechaIso) {
  return FORMATEADOR_FECHA_CORDOBA.format(new Date(fechaIso));
}

// Suma (o resta, con negativos) días a una fecha CALENDARIO "YYYY-MM-DD". Es
// aritmética de calendario pura, hecha en UTC sobre la fecha sin hora: no
// depende de la zona horaria ni de ningún horario de verano, y maneja fin de mes,
// fin de año y años bisiestos.
export function sumarDiasFechaISO(fechaISO, dias) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// "Hoy" y "mañana" como fecha calendario ("YYYY-MM-DD") en hora de Córdoba. Se
// parte del día de Córdoba de `ahora` y recién ahí se suma el día: sumarle 24 h al
// instante, o tomar el día en UTC, daría el día equivocado entre las 21:00 y las
// 24:00 de Córdoba (cuando en UTC ya es el día siguiente).
export function hoyCordobaISO(ahora = Date.now()) {
  return fechaCordobaISO(ahora);
}

export function mananaCordobaISO(ahora = Date.now()) {
  return sumarDiasFechaISO(hoyCordobaISO(ahora), 1);
}

// Porcentaje (0 a 100) del viaje transcurrido entre fechaInicio y fechaFin.
// Los valores de la API son instantes absolutos y "ahora" también, así que el
// cociente no depende de la zona horaria del navegador: es el mismo criterio
// de "hora de Córdoba" del resto de la app. Un viaje cuyo fin ya pasó queda en
// 100 (llena, sin ninguna marca de atraso).
export function porcentajeProgresoViaje(fechaInicio, fechaFin, ahora = Date.now()) {
  const inicio = new Date(fechaInicio).getTime();
  const fin = new Date(fechaFin).getTime();
  const total = fin - inicio;
  if (Number.isNaN(total)) return 0;
  if (total <= 0) return ahora >= fin ? 100 : 0;
  const porcentaje = ((ahora - inicio) / total) * 100;
  return Math.min(100, Math.max(0, Math.round(porcentaje)));
}
