// Tests unitarios de lecturaOdometroService.resolverVigentesPorViaje: es pura,
// así que solo se reemplaza prismaClient por un objeto vacío para que cargar
// el servicio no instancie el cliente real.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {} };

const { resolverVigentesPorViaje } = require(path.join(SRC, 'services', 'lecturaOdometroService.js'));

function lectura({ id, viajeId = 1, origen, valorKm, lecturaCorregidaId = null, creadoEn = '2026-11-20T12:00:00Z' }) {
  return {
    id,
    vehiculoId: 7,
    valorKm,
    fechaHora: new Date(creadoEn),
    origen: { descripcion: origen },
    viajeId,
    usuarioId: 10,
    lecturaCorregidaId,
    motivo: lecturaCorregidaId ? 'error de tipeo' : null,
    creadoEn: new Date(creadoEn),
  };
}

function idsVigentes(resultado, viajeId) {
  const { vigenteInicio, vigenteFin } = resultado.get(viajeId);
  return { inicio: vigenteInicio?.id ?? null, fin: vigenteFin?.id ?? null };
}

describe('resolverVigentesPorViaje', () => {
  test('sin correcciones: las lecturas de inicio y fin son las vigentes, sin serializar', () => {
    const inicio = lectura({ id: 1, origen: 'INICIO_VIAJE', valorKm: 1000 });
    const fin = lectura({ id: 2, origen: 'FIN_VIAJE', valorKm: 1200 });

    const resultado = resolverVigentesPorViaje([fin, inicio]);

    assert.equal(resultado.size, 1);
    assert.equal(resultado.get(1).vigenteInicio, inicio);
    assert.equal(resultado.get(1).vigenteFin, fin);
  });

  test('sigue una cadena de 2 eslabones hasta el final', () => {
    const resultado = resolverVigentesPorViaje([
      lectura({ id: 1, origen: 'INICIO_VIAJE', valorKm: 1000 }),
      lectura({ id: 2, origen: 'CORRECCION', valorKm: 1050, lecturaCorregidaId: 1, creadoEn: '2026-11-20T13:00:00Z' }),
      lectura({ id: 3, origen: 'CORRECCION', valorKm: 1100, lecturaCorregidaId: 2, creadoEn: '2026-11-20T14:00:00Z' }),
      lectura({ id: 4, origen: 'FIN_VIAJE', valorKm: 1500 }),
    ]);

    assert.deepEqual(idsVigentes(resultado, 1), { inicio: 3, fin: 4 });
    assert.equal(resultado.get(1).vigenteInicio.valorKm, 1100);
  });

  test('dos correcciones de la misma lectura en orden inverso: gana la más reciente', () => {
    const resultado = resolverVigentesPorViaje([
      lectura({ id: 1, origen: 'FIN_VIAJE', valorKm: 1500 }),
      lectura({ id: 3, origen: 'CORRECCION', valorKm: 1420, lecturaCorregidaId: 1, creadoEn: '2026-11-20T15:00:00Z' }),
      // La más vieja llega al final: no tiene que pisar a la de las 15.
      lectura({ id: 2, origen: 'CORRECCION', valorKm: 1999, lecturaCorregidaId: 1, creadoEn: '2026-11-20T14:00:00Z' }),
    ]);

    assert.deepEqual(idsVigentes(resultado, 1), { inicio: null, fin: 3 });
  });

  test('empate de creadoEn: gana la de mayor id, sin importar el orden', () => {
    const fin = lectura({ id: 1, origen: 'FIN_VIAJE', valorKm: 1500 });
    const a = lectura({ id: 5, origen: 'CORRECCION', valorKm: 1450, lecturaCorregidaId: 1 });
    const b = lectura({ id: 6, origen: 'CORRECCION', valorKm: 1460, lecturaCorregidaId: 1 });

    assert.equal(idsVigentes(resolverVigentesPorViaje([fin, a, b]), 1).fin, 6);
    assert.equal(idsVigentes(resolverVigentesPorViaje([fin, b, a]), 1).fin, 6);
  });

  test('un ciclo en la cadena no la cuelga', () => {
    const resultado = resolverVigentesPorViaje([
      lectura({ id: 1, origen: 'INICIO_VIAJE', valorKm: 1000, lecturaCorregidaId: 3 }),
      lectura({ id: 2, origen: 'CORRECCION', valorKm: 1050, lecturaCorregidaId: 1 }),
      lectura({ id: 3, origen: 'CORRECCION', valorKm: 1100, lecturaCorregidaId: 2 }),
    ]);

    assert.deepEqual(idsVigentes(resultado, 1), { inicio: 3, fin: null });
  });

  test('viaje con inicio y sin fin: vigenteFin es null', () => {
    const resultado = resolverVigentesPorViaje([
      lectura({ id: 1, viajeId: 1, origen: 'INICIO_VIAJE', valorKm: 1000 }),
      lectura({ id: 2, viajeId: 2, origen: 'INICIO_VIAJE', valorKm: 5000 }),
      lectura({ id: 3, viajeId: 2, origen: 'FIN_VIAJE', valorKm: 5200 }),
    ]);

    assert.deepEqual(idsVigentes(resultado, 1), { inicio: 1, fin: null });
    assert.deepEqual(idsVigentes(resultado, 2), { inicio: 2, fin: 3 });
  });
});
