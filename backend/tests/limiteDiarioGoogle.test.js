// Tests del tope diario propio de llamadas a Google (utils/limiteDiarioGoogle):
// cuenta por tipo, se reinicia a las 00:00 de Córdoba y se configura con
// variables de entorno. Sin red ni base.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const limite = require(path.join(__dirname, '..', 'src', 'utils', 'limiteDiarioGoogle.js'));

const VARIABLES = ['GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE', 'GOOGLE_LIMITE_DIARIO_DETALLES', 'GOOGLE_LIMITE_DIARIO_RUTAS'];

// 19/10 a las 15:00 de Córdoba (18:00 UTC).
const TARDE = new Date('2026-10-19T15:00:00-03:00');

beforeEach(() => {
  limite.reiniciar();
  for (const v of VARIABLES) delete process.env[v];
});

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe('límites', () => {
  test('por defecto: 1000 autocomplete, 300 detalles y 300 rutas', () => {
    assert.equal(limite.limiteDe('autocomplete'), 1000);
    assert.equal(limite.limiteDe('detalles'), 300);
    assert.equal(limite.limiteDe('rutas'), 300);
  });

  test('se configuran con GOOGLE_LIMITE_DIARIO_*', () => {
    process.env.GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE = '50';
    process.env.GOOGLE_LIMITE_DIARIO_DETALLES = '0';
    assert.equal(limite.limiteDe('autocomplete'), 50);
    assert.equal(limite.limiteDe('detalles'), 0);
  });

  test('un valor inválido (texto, negativo, decimal o vacío) usa el valor por defecto', () => {
    for (const valor of ['mil', '-5', '2.5', '', '  ']) {
      process.env.GOOGLE_LIMITE_DIARIO_RUTAS = valor;
      assert.equal(limite.limiteDe('rutas'), 300, JSON.stringify(valor));
    }
  });
});

describe('contador', () => {
  test('cuenta cada tipo por separado', () => {
    limite.consumir('autocomplete', TARDE);
    limite.consumir('autocomplete', TARDE);
    limite.consumir('rutas', TARDE);
    assert.deepEqual(limite.usoDeHoy(TARDE), { autocomplete: 2, detalles: 0, rutas: 1 });
  });

  test('al llegar al límite devuelve false y ya no cuenta', () => {
    process.env.GOOGLE_LIMITE_DIARIO_DETALLES = '2';
    assert.equal(limite.consumir('detalles', TARDE), true);
    assert.equal(limite.consumir('detalles', TARDE), true);
    assert.equal(limite.consumir('detalles', TARDE), false);
    assert.equal(limite.consumir('detalles', TARDE), false);
    assert.equal(limite.usoDeHoy(TARDE).detalles, 2);
    assert.equal(limite.consumir('rutas', TARDE), true, 'el tope de un tipo no frena a los otros');
  });

  test('con límite 0 no se permite ninguna llamada de ese tipo', () => {
    process.env.GOOGLE_LIMITE_DIARIO_AUTOCOMPLETE = '0';
    assert.equal(limite.consumir('autocomplete', TARDE), false);
  });

  test('un tipo desconocido es un error de programación', () => {
    assert.throws(() => limite.consumir('geocoding', TARDE), /desconocido/);
  });

  test('reiniciar() lo vuelve a 0 (lo mismo que pasa al reiniciar el servidor)', () => {
    limite.consumir('rutas', TARDE);
    limite.reiniciar();
    assert.deepEqual(limite.usoDeHoy(TARDE), { autocomplete: 0, detalles: 0, rutas: 0 });
  });
});

describe('reinicio diario en hora de Córdoba (UTC-3)', () => {
  test('el día es el de Córdoba, no el de UTC', () => {
    // 00:30 UTC del 20 = 21:30 del 19 en Córdoba.
    assert.equal(limite.diaCordoba(new Date('2026-10-20T00:30:00Z')), '2026-10-19');
    assert.equal(limite.diaCordoba(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
  });

  test('a las 23:59 de Córdoba sigue el mismo día; a las 00:00 vuelve a 0', () => {
    process.env.GOOGLE_LIMITE_DIARIO_RUTAS = '1';
    assert.equal(limite.consumir('rutas', new Date('2026-10-19T08:00:00-03:00')), true);
    // 23:59 de Córdoba = 02:59 UTC del día siguiente: todavía es el 19.
    assert.equal(limite.consumir('rutas', new Date('2026-10-19T23:59:59-03:00')), false);
    // 00:00 de Córdoba del 20.
    assert.equal(limite.consumir('rutas', new Date('2026-10-20T00:00:00-03:00')), true);
    assert.equal(limite.usoDeHoy(new Date('2026-10-20T00:00:01-03:00')).rutas, 1);
  });
});
