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
