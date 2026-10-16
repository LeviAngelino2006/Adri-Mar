// Tests de conContexto (réplica de la regla de frontend/src/utils/googleMaps.js).
// Son los mismos nombres y resultados esperados que googleMaps.test.js, para
// que el cálculo de km y el link de Google Maps interpreten igual cada punto.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { conContexto } = require(path.join(__dirname, '..', 'src', 'utils', 'contextoUbicacion.js'));

test('un nombre sin coma recibe ", Córdoba, Argentina"', () => {
  assert.equal(conContexto('Río Tercero'), 'Río Tercero, Córdoba, Argentina');
  assert.equal(conContexto('Córdoba'), 'Córdoba, Córdoba, Argentina');
  assert.equal(conContexto('Alta Gracia'), 'Alta Gracia, Córdoba, Argentina');
  assert.equal(conContexto('Museo del Kempes'), 'Museo del Kempes, Córdoba, Argentina');
});

test('un nombre que ya trae coma no recibe el contexto de provincia', () => {
  assert.equal(conContexto('Villa Carlos Paz, Córdoba'), 'Villa Carlos Paz, Córdoba');
  assert.equal(conContexto('Rosario, Santa Fe'), 'Rosario, Santa Fe');
});

const fs = require('node:fs');
const RUTA_FRONT = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'googleMaps.js');

// Si alguien cambia la regla en un lado y no en el otro, este test falla. Se
// saltea si el backend se testea sin el front al lado (no es un monorepo entero).
test('es la misma regla que la del front (mismo texto fuente)', { skip: !fs.existsSync(RUTA_FRONT) }, () => {
  const front = fs.readFileSync(RUTA_FRONT, 'utf8');
  const back = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'contextoUbicacion.js'), 'utf8');
  const regla = /const conContexto = \(nombre\) => \(.*\);/;
  assert.ok(front.match(regla), 'no se encontró conContexto en googleMaps.js');
  assert.equal(back.match(regla)?.[0], front.match(regla)[0]);
});
