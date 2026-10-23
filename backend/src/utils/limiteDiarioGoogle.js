// Tope diario PROPIO de llamadas a Google Maps Platform, por tipo de llamada,
// para que un error (un bucle, alguien escribiendo sin parar) no se coma la
// cuota ni genere costos. Es independiente de las cuotas que se configuren en
// Google Cloud.
//
// Es un TOPE BLANDO: el contador vive en memoria, así que se reinicia cada vez
// que arranca el servidor (un deploy o un reinicio de Render lo vuelve a 0), y
// si algún día hubiera más de una instancia, cada una contaría por su lado. Para
// un tope duro hay que configurar las cuotas en Google Cloud.
//
// El día es el de Córdoba (UTC-3 fijo, sin horario de verano, igual que el
// resto del backend): a las 00:00 de Córdoba los contadores vuelven a 0.

const CORDOBA_OFFSET_MS = 3 * 60 * 60 * 1000;

// tipo → variable de entorno y valor por defecto.
const LIMITES = {
  autocomplete: { variable: 'GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE', porDefecto: 1000 },
  detalles: { variable: 'GOOGLE_LIMITE_DIARIO_DETALLES', porDefecto: 300 },
  rutas: { variable: 'GOOGLE_LIMITE_DIARIO_RUTAS', porDefecto: 300 },
};

const MENSAJE_LIMITE = 'Se alcanzó el límite diario de consultas a Google Maps. Intentá mañana o cargá los km a mano.';

let dia = null;
let contadores = {};

// "2026-10-19" en hora de Córdoba.
function diaCordoba(ahora) {
  return new Date(ahora.getTime() - CORDOBA_OFFSET_MS).toISOString().slice(0, 10);
}

// El límite de un tipo: la variable de entorno si es un entero >= 0, si no el
// valor por defecto. Se lee en cada llamada, así un cambio de configuración no
// necesita reiniciar nada más que el proceso que ya lo relee.
function limiteDe(tipo) {
  const { variable, porDefecto } = LIMITES[tipo];
  const crudo = process.env[variable];
  if (crudo === undefined || crudo.trim() === '') return porDefecto;
  const valor = Number(crudo);
  return Number.isInteger(valor) && valor >= 0 ? valor : porDefecto;
}

function alDia(ahora) {
  const hoy = diaCordoba(ahora);
  if (hoy !== dia) {
    dia = hoy;
    contadores = {};
  }
}

// Reserva una llamada del tipo. Devuelve true si se puede llamar a Google (y
// la cuenta) o false si ya se alcanzó el límite del día (y no la cuenta).
function consumir(tipo, ahora = new Date()) {
  if (!LIMITES[tipo]) throw new Error(`Tipo de llamada a Google desconocido: ${tipo}`);
  alDia(ahora);
  const usadas = contadores[tipo] ?? 0;
  if (usadas >= limiteDe(tipo)) return false;
  contadores[tipo] = usadas + 1;
  return true;
}

// Lo usado hoy por tipo (para diagnóstico y tests).
function usoDeHoy(ahora = new Date()) {
  alDia(ahora);
  return Object.fromEntries(Object.keys(LIMITES).map((tipo) => [tipo, contadores[tipo] ?? 0]));
}

// Vuelve todo a 0, como si el servidor recién arrancara (para tests).
function reiniciar() {
  dia = null;
  contadores = {};
}

module.exports = { consumir, usoDeHoy, reiniciar, limiteDe, diaCordoba, LIMITES, MENSAJE_LIMITE };
