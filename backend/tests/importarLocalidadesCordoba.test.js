// Tests del script de importación de localidades de Córdoba (Georef). La API de
// Georef está mockeada (fetch inyectado) y la base es un doble en memoria: no
// salen a internet ni tocan una base real.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  URL_GEOREF,
  obtenerLocalidades,
  planificar,
  ejecutar,
  RespuestaGeorefInvalidaError,
} = require(path.join(__dirname, '..', 'scripts', 'importarLocalidadesCordoba.js'));

// --- Georef (recorte de la respuesta real, mismo formato) -------------------

const loc = (id, nombre, categoria, departamento, lat, lon) => ({
  id,
  nombre,
  categoria,
  centroide: { lat, lon },
  departamento: { id: `dep-${departamento}`, nombre: departamento },
  municipio: { id: null, nombre: null },
  provincia: { id: '14', nombre: 'Córdoba' },
});

const LOCALIDADES = [
  // El mismo lugar, como Entidad y como Componente: se importa uno.
  loc('1401401003', 'Córdoba', 'Entidad', 'Capital', -31.415, -64.1791),
  loc('14014010', 'Córdoba', 'Componente de localidad compuesta', 'Capital', -31.4168, -64.1836),
  loc('14091070', 'Cosquín', 'Componente de localidad compuesta', 'Punilla', -31.2437, -64.4653),
  loc('14091250', 'Villa Carlos Paz', 'Componente de localidad compuesta', 'Punilla', -31.4179, -64.494),
  loc('14098230', 'Río Cuarto', 'Componente de localidad compuesta', 'Río Cuarto', -33.1238, -64.349),
  // Homónimos en distintos departamentos.
  loc('14021090', 'La Puerta', 'Localidad simple', 'Colón', -31.15, -64.05),
  loc('14126080', 'La Puerta', 'Localidad simple', 'Río Primero', -30.89, -63.25),
  loc('1401401002', 'La Floresta', 'Entidad', 'Capital', -31.3968, -64.0599),
];

const respuestaGeoref = (localidades = LOCALIDADES, extra = {}) => ({
  cantidad: localidades.length,
  total: localidades.length,
  inicio: 0,
  parametros: { provincia: 'cordoba', max: 1000 },
  localidades,
  ...extra,
});

let pedidos = [];
function fetchGeoref(cuerpo = respuestaGeoref(), status = 200) {
  return async (url, opciones) => {
    pedidos.push({ url, opciones });
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

// --- Base en memoria ---------------------------------------------------------

const fila = (id, nombre, nombreNormalizado, extra = {}) => ({ id, nombre, nombreNormalizado, latitud: null, longitud: null, georefId: null, ...extra });

const EXISTENTES = () => [
  fila(1, 'Cosquin', 'cosquin'),
  fila(2, 'Córdoba', 'cordoba'),
  fila(3, 'Villa Carlos Paz', 'villa carlos paz', { latitud: -31.42, longitud: -64.5 }),
  fila(4, 'La Puerta', 'la puerta'),
  fila(5, 'Colegio Nacional de Monserrat', 'colegio nacional de monserrat'),
  fila(6, 'Hotel Sierras', 'hotel sierras', { latitud: -31.65, longitud: -64.44 }),
];

// Doble con estado: findMany, createMany, update y $transaction (en orden, sin
// rollback: alcanza para estos tests). `soloLectura` hace fallar cualquier
// escritura, para probar que el dry-run no escribe.
function crearPrisma(filas, { soloLectura = false } = {}) {
  const escrituras = [];
  const prohibido = (metodo) => {
    throw new Error(`el dry-run no debe llamar a ${metodo}`);
  };
  const prisma = {
    filas,
    escrituras,
    ubicacion: {
      findMany: async () => filas.map((f) => ({ ...f })),
      createMany: ({ data }) => {
        if (soloLectura) prohibido('createMany');
        return async () => {
          for (const d of data) {
            if (filas.some((f) => f.nombreNormalizado === d.nombreNormalizado || (d.georefId && f.georefId === d.georefId))) {
              throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            }
          }
          let id = Math.max(0, ...filas.map((f) => f.id));
          for (const d of data) filas.push({ id: ++id, latitud: null, longitud: null, georefId: null, ...d });
          escrituras.push({ tipo: 'createMany', cantidad: data.length });
          return { count: data.length };
        };
      },
      update: ({ where, data }) => {
        if (soloLectura) prohibido('update');
        return async () => {
          const f = filas.find((x) => x.id === where.id);
          Object.assign(f, data);
          escrituras.push({ tipo: 'update', id: where.id, data });
          return f;
        };
      },
    },
    $transaction: async (operaciones) => {
      if (soloLectura) prohibido('$transaction');
      const resultados = [];
      for (const op of operaciones) resultados.push(await op());
      return resultados;
    },
  };
  return prisma;
}

const silencio = () => {};

beforeEach(() => {
  pedidos = [];
});

// --- planificar --------------------------------------------------------------

describe('planificar', () => {
  const plan = () => planificar(LOCALIDADES, EXISTENTES());

  test('nuevas: las que no coinciden con ninguna existente', () => {
    assert.deepEqual(
      plan().crear.map((c) => c.nombre).sort(),
      ['La Floresta', 'La Puerta (Colón)', 'La Puerta (Río Primero)', 'Río Cuarto']
    );
    const rioCuarto = plan().crear.find((c) => c.nombre === 'Río Cuarto');
    assert.deepEqual(rioCuarto, {
      georefId: '14098230',
      nombre: 'Río Cuarto',
      nombreNormalizado: 'rio cuarto',
      latitud: -33.1238,
      longitud: -64.349,
      categoria: 'Componente de localidad compuesta',
    });
  });

  test('coincidencia sin coordenadas: se completan coordenadas y georefId, y se corrige el nombre al oficial', () => {
    const cosquin = plan().completar.find((c) => c.id === 1);
    assert.deepEqual(cosquin, {
      id: 1,
      nombreActual: 'Cosquin',
      nombre: 'Cosquín',
      latitud: -31.2437,
      longitud: -64.4653,
      georefId: '14091070',
      categoria: 'Componente de localidad compuesta',
      renombrar: true,
    });
  });

  test('coincidencia con el nombre ya oficial: se completa sin renombrar', () => {
    const cordoba = plan().completar.find((c) => c.id === 2);
    assert.equal(cordoba.renombrar, false);
    assert.equal(cordoba.georefId, '14014010', 'la localidad, no su Entidad');
  });

  test('coincidencia que ya tiene coordenadas: no se toca', () => {
    const p = plan();
    assert.deepEqual(p.conCoordenadas.map((c) => c.id), [3]);
    assert.ok(!p.completar.some((c) => c.id === 3));
  });

  test('Entidad con el mismo nombre y departamento que su localidad: se importa una sola', () => {
    assert.deepEqual(plan().descartadas, [
      { georefId: '1401401003', nombre: 'Córdoba', departamento: 'Capital', categoria: 'Entidad', mismaQue: '14014010' },
    ]);
  });

  test('homónimos: el departamento entre paréntesis, sin coma', () => {
    const { homonimos } = plan();
    assert.deepEqual(homonimos, [
      {
        nombre: 'La Puerta',
        localidades: [
          { georefId: '14021090', nombreFinal: 'La Puerta (Colón)', departamento: 'Colón', categoria: 'Localidad simple' },
          { georefId: '14126080', nombreFinal: 'La Puerta (Río Primero)', departamento: 'Río Primero', categoria: 'Localidad simple' },
        ],
      },
    ]);
    assert.ok(homonimos[0].localidades.every((l) => !l.nombreFinal.includes(',')));
  });

  test('existentes sin coincidencia: puntos de interés, y la homónima pelada marcada como ambigua', () => {
    assert.deepEqual(plan().sinCoincidencia, [
      { id: 4, nombre: 'La Puerta', tieneCoordenadas: false, ambigua: true },
      { id: 5, nombre: 'Colegio Nacional de Monserrat', tieneCoordenadas: false, ambigua: false },
      { id: 6, nombre: 'Hotel Sierras', tieneCoordenadas: true, ambigua: false },
    ]);
  });

  test('desglose por categoría', () => {
    assert.deepEqual(plan().porCategoria, {
      Entidad: { enGeoref: 2, nuevas: 1, coinciden: 0, descartadas: 1 },
      'Componente de localidad compuesta': { enGeoref: 4, nuevas: 1, coinciden: 3, descartadas: 0 },
      'Localidad simple': { enGeoref: 2, nuevas: 2, coinciden: 0, descartadas: 0 },
    });
  });

  test('ya importada (mismo georefId) aunque le hayan cambiado el nombre: no se duplica ni se toca', () => {
    const existentes = [fila(9, 'Cosquín Centro', 'cosquin centro', { latitud: -31.24, longitud: -64.46, georefId: '14091070' })];
    const p = planificar(LOCALIDADES, existentes);
    assert.deepEqual(p.yaImportadas, [{ id: 9, nombre: 'Cosquín Centro', georefId: '14091070', categoria: 'Componente de localidad compuesta' }]);
    assert.ok(!p.crear.some((c) => c.georefId === '14091070'));
  });

  test('mismo nombre pero con otro georefId guardado: conflicto, no se toca', () => {
    const existentes = [fila(9, 'Cosquín', 'cosquin', { latitud: -31.2, longitud: -64.4, georefId: 'otro' })];
    const p = planificar(LOCALIDADES, existentes);
    assert.deepEqual(p.conflictos, [{ id: 9, nombre: 'Cosquín', georefIdGuardado: 'otro', georefId: '14091070' }]);
    assert.ok(!p.crear.some((c) => c.georefId === '14091070'));
  });

  test('una tilde descompuesta (NFD) en Georef se guarda compuesta y coincide igual', () => {
    const nfd = [{ ...LOCALIDADES[2], nombre: 'Cosquín'.normalize('NFD') }];
    const p = planificar(nfd, [fila(1, 'Cosquin', 'cosquin')]);
    assert.equal(p.completar[0].nombre, 'Cosquín'.normalize('NFC'));
    assert.equal(planificar(nfd, []).crear[0].nombre, 'Cosquín'.normalize('NFC'));
  });

  test('con la base vacía, ningún nombre se repite (el índice único no puede chocar)', () => {
    const { crear } = planificar(LOCALIDADES, []);
    assert.equal(new Set(crear.map((c) => c.nombreNormalizado)).size, crear.length);
    assert.equal(crear.length, LOCALIDADES.length - 1);
  });
});

// --- obtenerLocalidades ------------------------------------------------------

describe('obtenerLocalidades (API de Georef mockeada)', () => {
  test('pide la URL de Córdoba con max=1000 y devuelve las localidades', async () => {
    const localidades = await obtenerLocalidades(fetchGeoref());
    assert.equal(pedidos[0].url, URL_GEOREF);
    assert.match(URL_GEOREF, /provincia=cordoba/);
    assert.match(URL_GEOREF, /max=1000/);
    assert.equal(localidades.length, LOCALIDADES.length);
  });

  test('si Georef tiene más de las que devolvió (paginó): error, no un plan a medias', async () => {
    await assert.rejects(obtenerLocalidades(fetchGeoref(respuestaGeoref(LOCALIDADES, { total: 514 }))), RespuestaGeorefInvalidaError);
  });

  test('una localidad sin centroide: error', async () => {
    const rota = [{ ...LOCALIDADES[2], centroide: null }];
    await assert.rejects(obtenerLocalidades(fetchGeoref(respuestaGeoref(rota))), RespuestaGeorefInvalidaError);
  });

  test('Georef caído o sin localidades: error', async () => {
    await assert.rejects(obtenerLocalidades(fetchGeoref({}, 500)), RespuestaGeorefInvalidaError);
    await assert.rejects(obtenerLocalidades(fetchGeoref(respuestaGeoref([]))), RespuestaGeorefInvalidaError);
  });
});

// --- ejecutar (flujo completo) -----------------------------------------------

describe('ejecutar', () => {
  test('dry-run (por defecto): no escribe nada e imprime el resumen', async () => {
    const prisma = crearPrisma(EXISTENTES(), { soloLectura: true });
    const lineas = [];

    const { plan, resultado } = await ejecutar({ prisma, fetchFn: fetchGeoref(), log: (l) => lineas.push(l) });

    assert.equal(resultado, null);
    assert.equal(prisma.escrituras.length, 0);
    const texto = lineas.join('\n');
    assert.match(texto, /MODO: dry-run/);
    assert.match(texto, /Nuevas \(se crean\): 4/);
    assert.match(texto, /Coinciden con existentes: 3/);
    assert.match(texto, /#1 "Cosquin" -> "Cosquín"/);
    assert.match(texto, /La Puerta: "La Puerta \(Colón\)", "La Puerta \(Río Primero\)"/);
    assert.match(texto, /#5 "Colegio Nacional de Monserrat" \(sin coordenadas\)/);
    assert.match(texto, /#4 "La Puerta" \(sin coordenadas; AMBIGUA/);
    assert.match(texto, /no se escribió nada/);
    assert.equal(plan.crear.length, 4);
  });

  test('--aplicar: crea las nuevas, completa y renombra, en una transacción', async () => {
    const prisma = crearPrisma(EXISTENTES());

    const { resultado } = await ejecutar({ aplicar: true, prisma, fetchFn: fetchGeoref(), log: silencio });

    assert.deepEqual(resultado, { creadas: 4, completadas: 2, renombradas: 1 });
    const cosquin = prisma.filas.find((f) => f.id === 1);
    assert.deepEqual(
      { nombre: cosquin.nombre, nombreNormalizado: cosquin.nombreNormalizado, latitud: cosquin.latitud, georefId: cosquin.georefId },
      { nombre: 'Cosquín', nombreNormalizado: 'cosquin', latitud: -31.2437, georefId: '14091070' }
    );
    // La que ya tenía coordenadas sigue igual.
    assert.deepEqual(prisma.filas.find((f) => f.id === 3).latitud, -31.42);
    assert.equal(prisma.filas.find((f) => f.id === 3).georefId, null);
    assert.ok(prisma.filas.some((f) => f.nombre === 'La Puerta (Río Primero)' && f.georefId === '14126080'));
    assert.equal(prisma.filas.length, 6 + 4);
  });

  test('idempotente: la segunda corrida no crea ni modifica nada', async () => {
    const prisma = crearPrisma(EXISTENTES());
    await ejecutar({ aplicar: true, prisma, fetchFn: fetchGeoref(), log: silencio });
    const antes = JSON.stringify(prisma.filas);
    const escriturasAntes = prisma.escrituras.length;
    const lineas = [];

    const { plan, resultado } = await ejecutar({ aplicar: true, prisma, fetchFn: fetchGeoref(), log: (l) => lineas.push(l) });

    assert.equal(resultado, null);
    assert.equal(plan.crear.length, 0);
    assert.equal(plan.completar.length, 0);
    assert.equal(plan.yaImportadas.length, 6, 'las 4 creadas y las 2 completadas, por georefId');
    assert.equal(prisma.escrituras.length, escriturasAntes);
    assert.equal(JSON.stringify(prisma.filas), antes);
    assert.match(lineas.join('\n'), /Nada para escribir/);
  });
});
