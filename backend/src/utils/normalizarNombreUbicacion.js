// Nombre con el que se GUARDA y se muestra una ubicación: la primera letra de
// cada palabra en mayúscula y el resto en minúscula ("RIO TERCERO" y
// "rio tercero" pasan a "Rio Tercero"). Es distinto de normalizarNombre(), que
// solo sirve para COMPARAR (plega mayúsculas, acentos y espacios) y detectar
// duplicados.
//
// Reglas:
// - Se recortan los espacios de los extremos y se colapsan los repetidos.
// - Los acentos se respetan tal cual los escribió el usuario: no se agregan ni
//   se quitan ("rio" sigue siendo "Rio", "RÍO" pasa a "Río").
// - Las palabras de enlace (de, del, la, las, los, el, y, e, o) quedan en
//   minúscula, salvo que sean la primera palabra ("La Falda", "Cancha de Olaeta").
// - Un guion o una barra también separan palabras ("Coronel-Moldes").

const PALABRAS_DE_ENLACE = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o']);

const SEPARADORES = /([\s\-/]+)/;
const SOLO_SEPARADORES = /^[\s\-/]+$/;
const PRIMERA_LETRA = /\p{L}/u;

// Pone en mayúscula la primera letra de la palabra (no el primer carácter: así
// "(centro)" pasa a "(Centro)").
function capitalizar(palabra) {
  return palabra.replace(PRIMERA_LETRA, (letra) => letra.toLocaleUpperCase('es'));
}

function normalizarNombreUbicacion(nombre) {
  const limpio = String(nombre ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
  if (!limpio) return '';

  let esPrimera = true;
  return limpio
    .toLocaleLowerCase('es')
    .split(SEPARADORES)
    .map((parte) => {
      if (parte === '' || SOLO_SEPARADORES.test(parte)) return parte;

      const eraPrimera = esPrimera;
      esPrimera = false;

      if (!eraPrimera && PALABRAS_DE_ENLACE.has(parte)) return parte;
      return capitalizar(parte);
    })
    .join('');
}

module.exports = { normalizarNombreUbicacion };
