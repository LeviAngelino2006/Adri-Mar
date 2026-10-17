// Tests de motivosRevision: cuándo una geocodificación de ORS merece revisión.
// Los casos son respuestas REALES de Pelias (api.heigit.org, octubre 2026) para
// esos nombres, con el contexto ", Córdoba, Argentina" de conContexto.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { motivosRevision } = require(path.join(__dirname, '..', 'src', 'utils', 'revisionGeocodificacion.js'));

// [nombre cargado, { capa, nombreInterpretado, provincia } de Pelias, motivos esperados]
const CASOS_REALES = [
  ['Villa Carlos Paz', { capa: 'locality', nombreInterpretado: 'Villa Carlos Paz', provincia: 'CD' }, []],
  ['Córdoba', { capa: 'locality', nombreInterpretado: 'Córdoba', provincia: 'CD' }, []],
  ['Alta Gracia', { capa: 'locality', nombreInterpretado: 'Alta Gracia', provincia: 'CD' }, []],
  ['Cosquin', { capa: 'street', nombreInterpretado: 'Cosquín', provincia: 'CD' }, ['CALLE']],
  ['Villa Gral Belgrano', { capa: 'locality', nombreInterpretado: 'Vila', provincia: 'SF' }, ['NOMBRE_DISTINTO', 'OTRA_PROVINCIA']],
  ['Museo del Kempes', { capa: 'venue', nombreInterpretado: 'Parque del Kempes', provincia: 'CD' }, ['NOMBRE_DISTINTO']],
  // Mismo problema que Cosquin: hay calles con esos nombres en Córdoba capital.
  ['Santa Rosa', { capa: 'street', nombreInterpretado: 'Santa Rosa', provincia: 'CD' }, ['CALLE']],
  ['San Lorenzo', { capa: 'street', nombreInterpretado: 'San Lorenzo', provincia: 'CD' }, ['CALLE']],
  // Ya trae provincia: Santa Fe es lo pedido.
  ['Rosario, Santa Fe', { capa: 'locality', nombreInterpretado: 'Rosario', provincia: 'SF' }, []],
  // Parece dirección, así que la calle no es sospechosa; pero ORS no encontró la
  // altura (quedó "Avenida Colón", el centro de la calle) y el nombre no coincide
  // por la abreviatura: se marca. Es un falso positivo útil (el punto es la calle
  // entera, no el 1000).
  ['Av. Colón 1000', { capa: 'street', nombreInterpretado: 'Avenida Colón', provincia: 'CD' }, ['NOMBRE_DISTINTO']],
];

describe('motivosRevision con respuestas reales de Pelias', () => {
  for (const [nombre, interpretado, esperados] of CASOS_REALES) {
    test(`${nombre} → ${interpretado.nombreInterpretado} (${interpretado.capa}, ${interpretado.provincia}): ${esperados.join(', ') || 'sin revisar'}`, () => {
      assert.deepEqual(motivosRevision(nombre, interpretado), esperados);
    });
  }
});

describe('reglas', () => {
  test('CALLE: una dirección con altura o con prefijo de calle no es sospechosa por ser calle', () => {
    for (const nombre of ['Colón 1000', 'Av. Colón', 'Avenida Colón', 'Calle Rivadavia', 'Ruta 36 km 600', 'Bv. San Juan']) {
      assert.ok(!motivosRevision(nombre, { capa: 'street', nombreInterpretado: nombre, provincia: 'CD' }).includes('CALLE'), nombre);
    }
  });

  test('CALLE: también aplica a layer address', () => {
    assert.deepEqual(motivosRevision('Cosquin', { capa: 'address', nombreInterpretado: 'Cosquín', provincia: 'CD' }), ['CALLE']);
  });

  test('NOMBRE_DISTINTO ignora mayúsculas, tildes y espacios repetidos', () => {
    assert.deepEqual(motivosRevision('RIO  CUARTO', { capa: 'locality', nombreInterpretado: 'Río Cuarto', provincia: 'CD' }), []);
  });

  test('NOMBRE_DISTINTO: alcanza con que lo cargado esté dentro de lo encontrado', () => {
    assert.deepEqual(motivosRevision('Carlos Paz', { capa: 'locality', nombreInterpretado: 'Villa Carlos Paz', provincia: 'CD' }), []);
  });

  test('NOMBRE_DISTINTO compara solo el lugar, no la provincia escrita después de la coma', () => {
    assert.deepEqual(motivosRevision('Alta Gracia, Córdoba', { capa: 'locality', nombreInterpretado: 'Alta Gracia', provincia: 'CD' }), []);
  });

  test('OTRA_PROVINCIA solo si el nombre no traía provincia (se buscó en Córdoba)', () => {
    assert.deepEqual(motivosRevision('Rosario', { capa: 'locality', nombreInterpretado: 'Rosario', provincia: 'SF' }), ['OTRA_PROVINCIA']);
    assert.deepEqual(motivosRevision('Rosario, Santa Fe', { capa: 'locality', nombreInterpretado: 'Rosario', provincia: 'SF' }), []);
  });

  test('sin provincia en la respuesta no se marca OTRA_PROVINCIA', () => {
    assert.deepEqual(motivosRevision('Córdoba', { capa: 'locality', nombreInterpretado: 'Córdoba', provincia: undefined }), []);
  });
});
