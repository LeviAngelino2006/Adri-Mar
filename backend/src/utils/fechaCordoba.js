// Adri-mar opera únicamente en Córdoba, Argentina, que no tiene horario de
// verano (UTC-3 todo el año). Por eso el offset se puede fijar así, sin
// necesidad de una librería de zonas horarias. Lo usan viajeService y
// mantenimientoService: vive en utils para no importar un service desde otro.
const CORDOBA_UTC_OFFSET = '-03:00';
const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;
const TIENE_OFFSET_REGEX = /(Z|[+-]\d{2}:\d{2})$/;
const SOLO_DIA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Interpreta un string de fecha/hora SIN offset (como el que manda un
// <input type="datetime-local">, p. ej. "2026-12-16T23:30") como hora de
// Córdoba, en vez de dejar que Node lo interprete según la zona horaria del
// proceso del servidor (que puede no coincidir con Córdoba según dónde se
// despliegue el backend). Si el valor ya trae offset explícito (u "Z"), se
// respeta tal cual.
function aFechaCordoba(valor) {
  if (!valor) return null;

  if (TIENE_OFFSET_REGEX.test(valor)) {
    return new Date(valor);
  }

  const conSegundos = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor) ? `${valor}:00` : valor;
  return new Date(`${conSegundos}${CORDOBA_UTC_OFFSET}`);
}

// Día calendario de Córdoba ("YYYY-MM-DD") de un instante.
function diaCordobaISO(fecha) {
  return new Date(fecha.getTime() - CORDOBA_OFFSET_MS).toISOString().slice(0, 10);
}

// Un día suelto ("2026-10-23", lo que manda un <input type="date">) como
// instante: el mediodía de ese día en Córdoba, así el día no cambia en ninguna
// zona horaria. Con hora, se interpreta como aFechaCordoba. null si no vino;
// una fecha inválida (isNaN(getTime())) si no se pudo leer.
function aDiaCordoba(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const texto = String(valor).trim();
  return SOLO_DIA_REGEX.test(texto) ? new Date(`${texto}T12:00:00${CORDOBA_UTC_OFFSET}`) : aFechaCordoba(texto);
}

module.exports = { CORDOBA_UTC_OFFSET, CORDOBA_OFFSET_MS, aFechaCordoba, aDiaCordoba, diaCordobaISO, SOLO_DIA_REGEX };
