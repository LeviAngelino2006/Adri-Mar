const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { normalizarNombreUbicacion } = require(path.join(__dirname, '..', 'src', 'utils', 'normalizarNombreUbicacion.js'));

describe('normalizarNombreUbicacion', () => {
  const CASOS = [
    // Mayúsculas y minúsculas
    ['RIO TERCERO', 'Rio Tercero'],
    ['rio tercero', 'Rio Tercero'],
    ['Rio Tercero', 'Rio Tercero'],
    ['rIo tErCeRo', 'Rio Tercero'],

    // Palabras de enlace en minúscula, salvo que sean la primera
    ['cancha de olaeta', 'Cancha de Olaeta'],
    ['CANCHA DE OLAETA', 'Cancha de Olaeta'],
    ['villa del rosario', 'Villa del Rosario'],
    ['san francisco del chañar', 'San Francisco del Chañar'],
    ['rio de la plata', 'Rio de la Plata'],
    ['los cocos y las rosas', 'Los Cocos y las Rosas'],
    ['punta e hijos o socios', 'Punta e Hijos o Socios'],
    ['la falda', 'La Falda'],
    ['DE LA CRUZ', 'De la Cruz'],
    ['el trebol', 'El Trebol'],
    ['y', 'Y'],

    // Los acentos se respetan: ni se agregan ni se quitan
    ['río cuarto', 'Río Cuarto'],
    ['RÍO CUARTO', 'Río Cuarto'],
    ['rio cuarto', 'Rio Cuarto'],
    ['córdoba', 'Córdoba'],
    ['CÓRDOBA CAPITAL', 'Córdoba Capital'],
    ['ñandú', 'Ñandú'],
    ['ÑANDÚ', 'Ñandú'],
    ['álvarez', 'Álvarez'],

    // Espacios
    ['  villa   maría  ', 'Villa María'],
    ['\tvilla\nmaria ', 'Villa Maria'],

    // Separadores y signos
    ['coronel-moldes', 'Coronel-Moldes'],
    ['rio cuarto (centro)', 'Rio Cuarto (Centro)'],
    ['ruta 36 km 5', 'Ruta 36 Km 5'],
    ['rio tercero/cordoba', 'Rio Tercero/Cordoba'],

    // Vacíos
    ['', ''],
    ['   ', ''],
    [null, ''],
    [undefined, ''],
  ];

  for (const [entrada, esperado] of CASOS) {
    test(`${JSON.stringify(entrada)} -> ${JSON.stringify(esperado)}`, () => {
      assert.equal(normalizarNombreUbicacion(entrada), esperado);
    });
  }

  test('es idempotente', () => {
    for (const [entrada] of CASOS) {
      const una = normalizarNombreUbicacion(entrada);
      assert.equal(normalizarNombreUbicacion(una), una);
    }
  });

  test('un acento escrito con tilde separada (NFD) se compone y se respeta', () => {
    const descompuesto = 'rio cuarto'.replace('i', 'í'); // "i" + tilde combinante
    assert.equal(normalizarNombreUbicacion(descompuesto), 'Río Cuarto');
  });

  test('no agrega acentos que el usuario no escribió', () => {
    assert.equal(normalizarNombreUbicacion('RIO TERCERO'), 'Rio Tercero');
    assert.notEqual(normalizarNombreUbicacion('RIO TERCERO'), 'Río Tercero');
  });
});
