// Tests de documentación de vehículos y choferes: versión vigente derivada
// (la más reciente por titular y tipo), historial acotado (2 viejas + la
// vigente), archivos compartidos entre versiones, validación de categoría,
// ids inválidos y estados de vigencia en hora de Córdoba.
//
// Levantan la app real de Express con un JWT real, con Prisma reemplazado por
// el doble con estado de helpers/prismaFalsoConEstado.js ($transaction con
// rollback real) y con un Storage en memoria. NO tocan la base, Supabase ni el
// .env. Se corren con `npm test` (node:test).
//
// Tipos del doble: 1 POLIZA_SEGURO (vehículo, vence, PDF), 2 MATAFUEGOS
// (vehículo, vence, sin PDF), 3 TITULO_VEHICULO (vehículo, sin vence, PDF),
// 4 LICENCIA_CONDUCIR (chofer, vence, PDF), 5 DNI_CHOFER (chofer, PDF).
// Vehículo 7 y chofer 5 existen; el usuario que registra es el 10.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache, cba } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar } = crearEntorno();
const { documentos, fallos } = db;

instalarEnCache(SRC, prismaFalso);

// Storage en memoria: `archivos` es lo que hay en el bucket y `borrados` lo que
// se pidió eliminar (en orden).
const archivos = new Set();
const borrados = [];
const llamadasFirma = [];
const storageFalso = {
  subirArchivo: async (buffer, ruta) => {
    archivos.add(ruta);
  },
  generarSignedUrl: async (ruta, segundos) => {
    llamadasFirma.push({ ruta, segundos });
    return `http://storage.test/${ruta}`;
  },
  eliminarArchivo: async (ruta) => {
    borrados.push(ruta);
    archivos.delete(ruta);
    return true;
  },
};
const rutaStorage = require.resolve(path.join(SRC, 'services', 'storageService.js'));
require.cache[rutaStorage] = { id: rutaStorage, filename: rutaStorage, loaded: true, exports: storageFalso };

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const { calcularEstadoVigencia } = require(path.join(SRC, 'services', 'documentoService.js'));

// --- Helpers ----------------------------------------------------------------

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/documentos`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  sembrar();
  archivos.clear();
  borrados.length = 0;
});

function tokenDe(perfil) {
  return generarToken({ id: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });
}

async function leer(respuesta) {
  return { status: respuesta.status, json: await respuesta.json() };
}

async function pedir(metodo, ruta, perfil = 'ADMINISTRADOR') {
  // '/../' deja salir de /api/documentos para tocar otros módulos (p. ej. la baja de un vehículo).
  return leer(await fetch(`${base}${ruta}`, { method: metodo, headers: { Authorization: `Bearer ${tokenDe(perfil)}` } }));
}

// POST multipart como el del front: campos de texto + `archivo` opcional.
async function subir(ruta, campos, { pdf = false } = {}, perfil = 'ADMINISTRADOR') {
  const form = new FormData();
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
  if (pdf) form.append('archivo', new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), 'poliza.pdf');
  return leer(
    await fetch(`${base}${ruta}`, { method: 'POST', headers: { Authorization: `Bearer ${tokenDe(perfil)}` }, body: form })
  );
}

const POLIZA = 1;
const LICENCIA = 4;
const VENCE = '2027-06-30';

const subirPoliza = (opciones, campos = {}) =>
  subir('/vehiculos/7', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE, ...campos }, opciones);

// Fila sembrada directamente (sin pasar por el servicio) para armar historiales.
function agregarDocumento({ tipoDocumentoId = POLIZA, vehiculoId = 7, choferId = null, archivoPath = null, ...resto }) {
  const fila = {
    id: db.siguienteId++,
    tipoDocumentoId,
    vehiculoId: choferId ? null : vehiculoId,
    choferId,
    archivoPath,
    nombreArchivo: archivoPath ? 'poliza.pdf' : null,
    fechaEmision: null,
    fechaVencimiento: new Date('2027-06-30T12:00:00Z'),
    observaciones: null,
    usuarioId: 10,
    creadoEn: new Date('2026-03-01T00:00:00Z'),
    ...resto,
  };
  documentos.push(fila);
  if (archivoPath) archivos.add(archivoPath);
  return fila;
}

const pathsEnDb = () => documentos.map((d) => d.archivoPath);
const vigenteDeLaCarpeta = async (ruta = '/vehiculos/7', tipoId = POLIZA) => {
  const { json } = await pedir('GET', ruta);
  return json.documentos.find((item) => item.tipo.id === tipoId).documento;
};

// --- Vigencia ---------------------------------------------------------------

describe('calcularEstadoVigencia (hoy en hora de Córdoba)', () => {
  const doc = (fechaVencimiento) => ({ fechaVencimiento });

  test('sin documento es PENDIENTE y sin vencimiento es VIGENTE', () => {
    assert.equal(calcularEstadoVigencia(null), 'PENDIENTE');
    assert.equal(calcularEstadoVigencia(doc(null)), 'VIGENTE');
  });

  test('vence hoy a las 22:00 de Córdoba: POR_VENCER, no VENCIDO (aunque en UTC ya sea mañana)', () => {
    const ahora = cba('23:30'); // 02:30Z del día siguiente
    assert.equal(calcularEstadoVigencia(doc(cba('22:00')), ahora), 'POR_VENCER');
  });

  test('un vencimiento cargado como solo fecha (12:00Z) no vence antes de que termine el día en Córdoba', () => {
    const ahora = cba('22:00'); // 01:00Z del 21: un servidor en UTC ya vería "mañana"
    assert.equal(calcularEstadoVigencia(doc(new Date('2026-10-20T12:00:00Z')), ahora), 'POR_VENCER');
  });

  test('pasada la medianoche de Córdoba el documento está VENCIDO', () => {
    const ahora = cba('00:30', '2026-10-21');
    assert.equal(calcularEstadoVigencia(doc(cba('22:00')), ahora), 'VENCIDO');
  });

  test('el umbral de POR_VENCER son 30 días de calendario', () => {
    const ahora = cba('10:00');
    assert.equal(calcularEstadoVigencia(doc(cba('09:00', '2026-11-19')), ahora), 'POR_VENCER'); // 30 días
    assert.equal(calcularEstadoVigencia(doc(cba('09:00', '2026-11-20')), ahora), 'VIGENTE'); // 31 días
  });
});

// --- Versión vigente derivada -----------------------------------------------

describe('Versión vigente derivada', () => {
  test('la vigente es la más reciente por tipo y, al eliminarla, queda vigente la anterior', async () => {
    const primera = await subirPoliza({ pdf: true }, { observaciones: 'primera' });
    const segunda = await subirPoliza({ pdf: true }, { observaciones: 'segunda' });
    assert.equal(primera.status, 201);
    assert.equal(segunda.status, 201);

    assert.equal((await vigenteDeLaCarpeta()).id, segunda.json.documento.id);

    const historial = (await pedir('GET', `/vehiculos/7/tipos/${POLIZA}/historial`)).json.historial;
    assert.deepEqual(historial.map((h) => [h.id, h.esVigente]), [
      [segunda.json.documento.id, true],
      [primera.json.documento.id, false],
    ]);

    const baja = await pedir('DELETE', `/vehiculos/7/${segunda.json.documento.id}`);
    assert.equal(baja.status, 200);

    const vigente = await vigenteDeLaCarpeta();
    assert.equal(vigente.id, primera.json.documento.id);
    assert.equal(vigente.observaciones, 'primera');
  });

  test('los documentos de otro tipo o de otro titular no se mezclan', async () => {
    agregarDocumento({ tipoDocumentoId: 3, vehiculoId: 7, archivoPath: 'vehiculos/7/titulo.pdf' });
    agregarDocumento({ vehiculoId: 9, archivoPath: 'vehiculos/9/poliza.pdf' });
    const propia = await subirPoliza({ pdf: true });

    assert.equal((await vigenteDeLaCarpeta()).id, propia.json.documento.id);
    const historial = (await pedir('GET', `/vehiculos/7/tipos/${POLIZA}/historial`)).json.historial;
    assert.equal(historial.length, 1);
  });

  test('un chofer usa la misma lógica con su categoría', async () => {
    const alta = await subir('/choferes/5', { tipoDocumentoId: LICENCIA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(alta.status, 201);
    const { json } = await pedir('GET', '/choferes/5');
    assert.equal(json.documentos.length, 2); // LICENCIA_CONDUCIR y DNI_CHOFER
    assert.equal(json.resumen.totalCargados, 1);
    assert.equal(json.documentos.find((i) => i.tipo.id === LICENCIA).documento.id, alta.json.documento.id);
  });
});

// --- Archivo compartido e historial acotado ---------------------------------

describe('Archivos compartidos y purga del historial', () => {
  test('renovar 3 veces sin PDF nuevo no borra el archivo que usa la vigente', async () => {
    const alta = await subirPoliza({ pdf: true });
    const archivo = alta.json.documento.archivoPath;
    assert.ok(archivos.has(archivo));

    for (let i = 0; i < 3; i++) {
      const renovacion = await subirPoliza({ pdf: false }, { fechaVencimiento: `2027-0${i + 1}-15` });
      assert.equal(renovacion.status, 201);
      assert.equal(renovacion.json.documento.archivoPath, archivo);
      assert.equal(renovacion.json.documento.nombreArchivo, 'poliza.pdf');
    }

    // 4 versiones cargadas: la más vieja se purgó de la base, pero el archivo es el mismo.
    assert.equal(documentos.length, 3);
    assert.deepEqual(borrados, []);
    assert.ok(archivos.has(archivo));
    assert.equal((await vigenteDeLaCarpeta()).tieneArchivo, true);
  });

  test('con 4 versiones quedan 3 y solo se borran de Supabase los archivos que ya no usa nadie', async () => {
    const v1 = await subirPoliza({ pdf: true });
    const v2 = await subirPoliza({ pdf: true });
    await subirPoliza({ pdf: false }); // v3 reutiliza el archivo de v2
    assert.equal(documentos.length, 3);
    assert.deepEqual(borrados, []);

    await subirPoliza({ pdf: false }); // v4: se purga v1, que tenía su propio archivo
    assert.equal(documentos.length, 3);
    assert.deepEqual(borrados, [v1.json.documento.archivoPath]);

    await subirPoliza({ pdf: false }); // v5: se purga v2, pero v3 y v4 siguen usando su archivo
    assert.equal(documentos.length, 3);
    assert.deepEqual(borrados, [v1.json.documento.archivoPath]);
    assert.ok(archivos.has(v2.json.documento.archivoPath));
  });

  test('eliminar una versión no borra el archivo mientras otra versión lo use', async () => {
    const alta = await subirPoliza({ pdf: true });
    const renovacion = await subirPoliza({ pdf: false });
    const archivo = alta.json.documento.archivoPath;

    await pedir('DELETE', `/vehiculos/7/${renovacion.json.documento.id}`);
    assert.deepEqual(borrados, []);
    assert.ok(archivos.has(archivo));

    await pedir('DELETE', `/vehiculos/7/${alta.json.documento.id}`);
    assert.deepEqual(borrados, [archivo]);
    assert.equal(documentos.length, 0);
  });

  test('si falla la escritura en la base después de subir un PDF nuevo, se borra ese PDF', async () => {
    fallos.createDocumento = true;
    const respuesta = await subirPoliza({ pdf: true });

    assert.equal(respuesta.status, 500);
    assert.equal(documentos.length, 0);
    assert.equal(archivos.size, 0);
    assert.equal(borrados.length, 1);
  });

  test('si falla la purga se deshace la versión nueva y no se borra ningún archivo viejo', async () => {
    agregarDocumento({ archivoPath: 'vehiculos/7/a.pdf', creadoEn: new Date('2026-01-01T00:00:00Z') });
    agregarDocumento({ archivoPath: 'vehiculos/7/b.pdf', creadoEn: new Date('2026-02-01T00:00:00Z') });
    agregarDocumento({ archivoPath: 'vehiculos/7/c.pdf', creadoEn: new Date('2026-03-01T00:00:00Z') });
    fallos.deleteManyDocumentos = true;

    const respuesta = await subirPoliza({ pdf: true });

    assert.equal(respuesta.status, 500);
    assert.deepEqual(pathsEnDb(), ['vehiculos/7/a.pdf', 'vehiculos/7/b.pdf', 'vehiculos/7/c.pdf']);
    // Solo se descarta el PDF recién subido; los tres anteriores siguen en el bucket.
    assert.equal(borrados.length, 1);
    assert.ok(['a', 'b', 'c'].every((n) => archivos.has(`vehiculos/7/${n}.pdf`)));
  });
});

// --- Validaciones -----------------------------------------------------------

describe('Validaciones de categoría e ids', () => {
  test('un tipo de CHOFER cargado a un vehículo da 400 (y al revés)', async () => {
    const aVehiculo = await subir('/vehiculos/7', { tipoDocumentoId: LICENCIA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(aVehiculo.status, 400);

    const aChofer = await subir('/choferes/5', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(aChofer.status, 400);

    assert.equal(documentos.length, 0);
    assert.equal(archivos.size, 0, 'no se debe subir ningún PDF si la categoría no coincide');
  });

  test('el historial de un tipo de otra categoría da 400', async () => {
    assert.equal((await pedir('GET', `/vehiculos/7/tipos/${LICENCIA}/historial`)).status, 400);
  });

  test('ids no numéricos, fuera de rango o inexistentes dan 400/404, nunca 500', async () => {
    const casos = [
      ['GET', '/vehiculos/abc', 400],
      ['GET', '/choferes/1.5', 400],
      ['GET', '/vehiculos/99999999999', 400],
      ['GET', '/vehiculos/9999', 404],
      ['GET', '/choferes/9999', 404],
      ['GET', '/vehiculos/7/tipos/xyz/historial', 400],
      ['GET', '/vehiculos/7/tipos/999/historial', 404],
      ['DELETE', '/vehiculos/7/abc', 400],
      ['DELETE', '/vehiculos/7/9999', 404],
      ['DELETE', '/choferes/abc/1', 400],
      ['GET', '/tipos?categoria=FOO', 400],
    ];
    for (const [metodo, ruta, esperado] of casos) {
      const { status } = await pedir(metodo, ruta);
      assert.equal(status, esperado, `${metodo} ${ruta}`);
    }
  });

  test('tipoDocumentoId inválido, inexistente o ausente al registrar no da 500', async () => {
    const abc = await subir('/vehiculos/7', { tipoDocumentoId: 'abc', fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(abc.status, 400);
    const inexistente = await subir('/vehiculos/7', { tipoDocumentoId: 999, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(inexistente.status, 400);
    const ausente = await subir('/vehiculos/7', { fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(ausente.status, 400);
    const vehiculoInexistente = await subir('/vehiculos/9999', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(vehiculoInexistente.status, 404);
  });

  test('exige PDF y vencimiento según el tipo, y fechas coherentes', async () => {
    assert.equal((await subir('/vehiculos/7', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE })).status, 400);
    assert.equal((await subir('/vehiculos/7', { tipoDocumentoId: POLIZA }, { pdf: true })).status, 400);
    const invertidas = await subir(
      '/vehiculos/7',
      { tipoDocumentoId: POLIZA, fechaEmision: '2027-01-02', fechaVencimiento: '2027-01-01' },
      { pdf: true }
    );
    assert.equal(invertidas.status, 400);
    // MATAFUEGOS (2) no requiere PDF: alcanza con la vigencia.
    assert.equal((await subir('/vehiculos/7', { tipoDocumentoId: 2, fechaVencimiento: VENCE })).status, 201);
  });

  test('el catálogo se filtra por categoria', async () => {
    const vehiculo = await pedir('GET', '/tipos?categoria=VEHICULO');
    assert.deepEqual(vehiculo.json.tipos.map((t) => t.descripcion), ['POLIZA_SEGURO', 'MATAFUEGOS', 'TITULO_VEHICULO']);
    assert.equal(vehiculo.json.tipos[0].categoriaDocumento.descripcion, 'VEHICULO');
    const chofer = await pedir('GET', '/tipos?categoria=CHOFER');
    assert.deepEqual(chofer.json.tipos.map((t) => t.descripcion), ['LICENCIA_CONDUCIR', 'DNI_CHOFER']);
  });
});

// --- Estado de flota y alertas ----------------------------------------------

describe('Estado de flota y alertas usan la versión vigente', () => {
  test('estado de flota: pendientes, vencidos y por vencer sobre la vigente', async () => {
    const hoy = new Date();
    const enDias = (n) => new Date(hoy.getTime() + n * 24 * 60 * 60 * 1000);
    // Versión vieja vencida, pero la vigente (más nueva) está por vencer.
    agregarDocumento({ fechaVencimiento: enDias(-10), creadoEn: new Date('2026-01-01T00:00:00Z') });
    agregarDocumento({ fechaVencimiento: enDias(10), creadoEn: new Date('2026-02-01T00:00:00Z') });

    const { json } = await pedir('GET', '/estado-flota');
    const v7 = json.vehiculos.find((v) => v.id === 7);
    assert.equal(v7.totalCargados, 1);
    assert.equal(v7.totalRequeridos, 3);
    assert.equal(v7.tieneVencidos, false);
    assert.equal(v7.tienePorVencer, true);
    assert.equal(v7.tienePendientes, true);
    assert.equal(v7.alDia, false);
    assert.ok(!json.vehiculos.some((v) => v.id === 10), 'los dados de baja no se listan');
  });

  test('alertas: solo la vigente, categoría CHOFER para choferes y POR_VENCER / VENCIDO', async () => {
    const hoy = new Date();
    const enDias = (n) => new Date(hoy.getTime() + n * 24 * 60 * 60 * 1000);
    // Póliza: la vieja venció, pero la nueva vence en un año => no hay alerta.
    agregarDocumento({ fechaVencimiento: enDias(-5), creadoEn: new Date('2026-01-01T00:00:00Z') });
    agregarDocumento({ fechaVencimiento: enDias(365), creadoEn: new Date('2026-02-01T00:00:00Z') });
    // Matafuegos del vehículo 7 por vencer; licencia del chofer 5 vencida.
    agregarDocumento({ tipoDocumentoId: 2, fechaVencimiento: enDias(10) });
    agregarDocumento({ tipoDocumentoId: LICENCIA, vehiculoId: null, choferId: 5, fechaVencimiento: enDias(-20) });
    // Vehículo dado de baja y chofer inactivo: sin alerta.
    agregarDocumento({ tipoDocumentoId: 2, vehiculoId: 10, fechaVencimiento: enDias(1) });
    agregarDocumento({ tipoDocumentoId: LICENCIA, vehiculoId: null, choferId: 8, fechaVencimiento: enDias(1) });

    const { json } = await pedir('GET', '/alertas');
    assert.equal(json.totalAlertas, 2);
    assert.equal(json.vencidos, 1);
    assert.equal(json.proximosAVencer, 1);
    assert.deepEqual(
      json.documentos.map((d) => [d.categoria, d.tipo, d.estado]),
      [
        ['CHOFER', 'LICENCIA_CONDUCIR', 'VENCIDO'],
        ['VEHICULO', 'MATAFUEGOS', 'POR_VENCER'],
      ]
    );
    assert.equal(json.documentos[0].usuario.id, 5);
    assert.equal(json.documentos[1].vehiculo.id, 7);
  });
});

// --- Permisos ---------------------------------------------------------------

describe('Permisos del módulo de documentación', () => {
  const RUTAS = [
    ['GET', '/alertas'],
    ['GET', '/tipos'],
    ['GET', '/estado-flota'],
    ['GET', '/estado-choferes'],
    ['GET', '/vehiculos/7'],
    ['GET', `/vehiculos/7/tipos/${POLIZA}/historial`],
    ['POST', '/vehiculos/7'],
    ['DELETE', '/vehiculos/7/1'],
    ['GET', '/choferes/5'],
    ['GET', `/choferes/5/tipos/${LICENCIA}/historial`],
    ['POST', '/choferes/5'],
    ['DELETE', '/choferes/5/1'],
    ['GET', '/1/archivo'],
  ];

  test('Personal de Taller recibe 403 en todas las rutas de /documentos', async () => {
    for (const [metodo, ruta] of RUTAS) {
      const { status } = await pedir(metodo, ruta, 'PERSONAL_TALLER');
      assert.equal(status, 403, `${metodo} ${ruta}`);
    }
  });

  test('un chofer (sin perfil de gestión) también recibe 403', async () => {
    assert.equal((await pedir('GET', '/alertas', 'CHOFER')).status, 403);
  });

  test('Encargado recibe 403 en DELETE pero puede consultar y registrar', async () => {
    const alta = await subir('/vehiculos/7', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE }, { pdf: true }, 'ENCARGADO');
    assert.equal(alta.status, 201);
    const id = alta.json.documento.id;

    assert.equal((await pedir('DELETE', `/vehiculos/7/${id}`, 'ENCARGADO')).status, 403);
    assert.equal((await pedir('DELETE', `/choferes/5/${id}`, 'ENCARGADO')).status, 403);
    assert.equal(documentos.length, 1, 'el DELETE rechazado no borra nada');
    assert.equal((await pedir('GET', '/vehiculos/7', 'ENCARGADO')).status, 200);

    assert.equal((await pedir('DELETE', `/vehiculos/7/${id}`, 'ADMINISTRADOR')).status, 200);
  });
});

// --- Titulares ---------------------------------------------------------------

describe('Quién puede recibir documentación', () => {
  test('dar de baja un vehículo no borra sus documentos ni sus archivos', async () => {
    agregarDocumento({ archivoPath: 'vehiculos/7/a.pdf', creadoEn: new Date('2026-01-01T00:00:00Z') });
    agregarDocumento({ archivoPath: 'vehiculos/7/b.pdf', creadoEn: new Date('2026-02-01T00:00:00Z') });
    const antes = documentos.map((d) => d.id);

    // La baja usa más modelos que el doble de documentos; se completan solo para este test.
    const original = { findFirst: prismaFalso.viaje.findFirst, update: prismaFalso.vehiculo.update, estado: prismaFalso.estadoVehiculo };
    prismaFalso.viaje.findFirst = async () => null;
    prismaFalso.estadoVehiculo = { findUnique: async ({ where: { descripcion } }) => ({ id: 3, descripcion }) };
    prismaFalso.vehiculo.update = async ({ where: { id }, data }) => {
      const fila = db.vehiculos.find((v) => v.id === id);
      Object.assign(fila, { fechaBaja: data.fechaBaja, estadoVehiculo: { descripcion: 'DADO_DE_BAJA' } });
      return fila;
    };
    try {
      const baja = await pedir('PATCH', '/../vehiculos/7/baja');
      assert.equal(baja.status, 200);
      assert.equal(baja.json.vehiculo?.estado ?? baja.json.estado, 'DADO_DE_BAJA');
    } finally {
      prismaFalso.viaje.findFirst = original.findFirst;
      prismaFalso.vehiculo.update = original.update;
      prismaFalso.estadoVehiculo = original.estado;
    }

    assert.deepEqual(documentos.map((d) => d.id), antes);
    assert.deepEqual(borrados, []);
    assert.ok(archivos.has('vehiculos/7/a.pdf') && archivos.has('vehiculos/7/b.pdf'));
  });

  test('un vehículo dado de baja se puede consultar pero no modificar', async () => {
    agregarDocumento({ vehiculoId: 10, archivoPath: 'vehiculos/10/a.pdf' });

    assert.equal((await pedir('GET', '/vehiculos/10')).status, 200);
    assert.equal((await pedir('GET', `/vehiculos/10/tipos/${POLIZA}/historial`)).status, 200);

    const alta = await subir('/vehiculos/10', { tipoDocumentoId: POLIZA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(alta.status, 400);
    assert.equal(alta.json.error, 'No se puede modificar la documentación de un vehículo dado de baja.');
    assert.equal(documentos.length, 1);
    assert.equal(archivos.size, 1, 'no se sube ningún PDF');
  });

  test('a un usuario inactivo, o que no es chofer ni está habilitado, no se le registra documentación', async () => {
    const inactivo = await subir('/choferes/8', { tipoDocumentoId: LICENCIA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(inactivo.status, 400);

    const sinPerfil = await subir('/choferes/7', { tipoDocumentoId: LICENCIA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(sinPerfil.status, 400);
    assert.equal(documentos.length, 0);
    assert.equal(archivos.size, 0);

    // Su carpeta (con el historial) se sigue pudiendo consultar.
    assert.equal((await pedir('GET', '/choferes/8')).status, 200);
  });

  test('un usuario activo con perfil CHOFER sí, aunque no esté habilitado para conducir', async () => {
    db.usuarios.find((u) => u.id === 7).perfil = { descripcion: 'CHOFER' };
    const alta = await subir('/choferes/7', { tipoDocumentoId: LICENCIA, fechaVencimiento: VENCE }, { pdf: true });
    assert.equal(alta.status, 201);
  });

  test('el estado de choferes lista solo los activos', async () => {
    const { json } = await pedir('GET', '/estado-choferes');
    assert.deepEqual(json.choferes.map((c) => c.id).sort((a, b) => a - b), [5, 6, 10]);
  });
});

// --- Formato de errores -----------------------------------------------------

describe('Errores de validación por campo', () => {
  test('sin PDF ni vencimiento: 400 { errores } con un mensaje por campo', async () => {
    const { status, json } = await subir('/vehiculos/7', { tipoDocumentoId: POLIZA });
    assert.equal(status, 400);
    assert.deepEqual(Object.keys(json), ['errores']);
    assert.deepEqual(Object.keys(json.errores).sort(), ['archivo', 'fechaVencimiento']);
  });

  test('tipo faltante, inexistente o de otra categoría: errores.tipoDocumentoId', async () => {
    for (const campos of [{}, { tipoDocumentoId: 'abc' }, { tipoDocumentoId: 999 }, { tipoDocumentoId: LICENCIA }]) {
      const { status, json } = await subir('/vehiculos/7', { fechaVencimiento: VENCE, ...campos }, { pdf: true });
      assert.equal(status, 400, JSON.stringify(campos));
      assert.deepEqual(Object.keys(json.errores), ['tipoDocumentoId'], JSON.stringify(campos));
    }
  });

  test('fechas inválidas o invertidas: errores.fechaEmision / errores.fechaVencimiento', async () => {
    const invalidas = await subirPoliza({ pdf: true }, { fechaEmision: 'no-es-fecha', fechaVencimiento: 'tampoco' });
    assert.equal(invalidas.status, 400);
    assert.deepEqual(Object.keys(invalidas.json.errores).sort(), ['fechaEmision', 'fechaVencimiento']);

    const invertidas = await subirPoliza({ pdf: true }, { fechaEmision: '2027-01-02', fechaVencimiento: '2027-01-01' });
    assert.deepEqual(Object.keys(invertidas.json.errores), ['fechaVencimiento']);
  });

  test('los errores que no son de un campo siguen siendo { error }', async () => {
    const { status, json } = await pedir('GET', '/vehiculos/9999');
    assert.equal(status, 404);
    assert.deepEqual(Object.keys(json), ['error']);
  });

  test('un PDF de más de 15 MB devuelve el mensaje en español', async () => {
    const pesado = new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: 'application/pdf' });
    const form = new FormData();
    form.append('tipoDocumentoId', POLIZA);
    form.append('fechaVencimiento', VENCE);
    form.append('archivo', pesado, 'grande.pdf');
    const { status, json } = await leer(
      await fetch(`${base}/vehiculos/7`, { method: 'POST', headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` }, body: form })
    );
    assert.equal(status, 400);
    assert.deepEqual(json, { errores: { archivo: 'El archivo supera el máximo de 15 MB.' } });
    assert.equal(archivos.size, 0);
  });

  test('un archivo que no es PDF devuelve el mensaje en español', async () => {
    const form = new FormData();
    form.append('tipoDocumentoId', POLIZA);
    form.append('fechaVencimiento', VENCE);
    form.append('archivo', new Blob(['hola'], { type: 'text/plain' }), 'notas.txt');
    const { status, json } = await leer(
      await fetch(`${base}/vehiculos/7`, { method: 'POST', headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` }, body: form })
    );
    assert.equal(status, 400);
    assert.deepEqual(json, { errores: { archivo: 'Solo se permiten archivos PDF.' } });
  });
});

// --- Signed URLs bajo demanda ------------------------------------------------

describe('GET /documentos/:documentoId/archivo', () => {
  test('la carpeta y el historial no generan URLs: informan tieneArchivo', async () => {
    llamadasFirma.length = 0;
    await subirPoliza({ pdf: true });
    await subir('/vehiculos/7', { tipoDocumentoId: 2, fechaVencimiento: VENCE }); // sin PDF

    const carpeta = (await pedir('GET', '/vehiculos/7')).json.documentos;
    assert.equal(carpeta.find((i) => i.tipo.id === POLIZA).documento.tieneArchivo, true);
    assert.equal(carpeta.find((i) => i.tipo.id === 2).documento.tieneArchivo, false);
    const historial = (await pedir('GET', `/vehiculos/7/tipos/${POLIZA}/historial`)).json.historial;
    assert.equal(historial[0].tieneArchivo, true);
    assert.ok(carpeta.every((i) => !i.documento || !('signedUrl' in i.documento)));
    assert.deepEqual(llamadasFirma, []);
  });

  test('devuelve { url } con una firma de 5 minutos', async () => {
    const alta = await subirPoliza({ pdf: true });
    llamadasFirma.length = 0;

    const { status, json } = await pedir('GET', `/${alta.json.documento.id}/archivo`);
    assert.equal(status, 200);
    assert.equal(json.url, `http://storage.test/${alta.json.documento.archivoPath}`);
    assert.deepEqual(llamadasFirma, [{ ruta: alta.json.documento.archivoPath, segundos: 300 }]);
  });

  test('404 si el documento no existe o no tiene archivo; 400 si el id no es válido', async () => {
    assert.equal((await pedir('GET', '/9999/archivo')).status, 404);
    const sinPdf = await subir('/vehiculos/7', { tipoDocumentoId: 2, fechaVencimiento: VENCE });
    assert.equal((await pedir('GET', `/${sinPdf.json.documento.id}/archivo`)).status, 404);
    assert.equal((await pedir('GET', '/abc/archivo')).status, 400);
  });

  test('un administrador y un encargado pueden pedirla', async () => {
    const alta = await subirPoliza({ pdf: true });
    for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
      assert.equal((await pedir('GET', `/${alta.json.documento.id}/archivo`, perfil)).status, 200);
    }
  });
});
