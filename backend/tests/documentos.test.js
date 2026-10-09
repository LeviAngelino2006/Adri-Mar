process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// Doble de Prisma en memoria para tests de unidades
const prismaFalso = {
  documentoVehiculo: {
    findMany: async () => [],
    create: async ({ data }) => ({ id: 1, ...data }),
  },
  documentoChofer: {
    findMany: async () => [],
    create: async ({ data }) => ({ id: 1, ...data }),
  },
};

const storageFalso = {
  generarSignedUrl: async () => 'http://test-url.com',
  subirArchivo: async () => {},
  eliminarArchivo: async () => {},
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const rutaStorage = require.resolve(path.join(SRC, 'services', 'storageService.js'));
require.cache[rutaStorage] = { id: rutaStorage, filename: rutaStorage, loaded: true, exports: storageFalso };

const {
  calcularEstadoDocumento,
  purgarHistorialExcedenteVehiculo,
  purgarHistorialExcedenteChofer,
} = require(path.join(SRC, 'services', 'documentoService.js'));

describe('Servicio de Documentación - calcularEstadoDocumento', () => {
  test('calcula correctamente documento VENCIDO si la fecha ya pasó', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 2);

    const resultado = calcularEstadoDocumento(ayer);
    assert.equal(resultado.estado, 'VENCIDO');
    assert.ok(resultado.diasRestantes < 0);
  });

  test('calcula correctamente PROXIMO_A_VENCER si vence en 15 días', () => {
    const en15Dias = new Date();
    en15Dias.setDate(en15Dias.getDate() + 15);

    const resultado = calcularEstadoDocumento(en15Dias);
    assert.equal(resultado.estado, 'PROXIMO_A_VENCER');
    assert.ok(resultado.diasRestantes >= 0 && resultado.diasRestantes <= 30);
  });

  test('calcula correctamente VIGENTE si vence en 60 días', () => {
    const en60Dias = new Date();
    en60Dias.setDate(en60Dias.getDate() + 60);

    const resultado = calcularEstadoDocumento(en60Dias);
    assert.equal(resultado.estado, 'VIGENTE');
    assert.ok(resultado.diasRestantes > 30);
  });
});

describe('Regla de negocio: Límite de historial (máximo 2 viejos sin contar el actual)', () => {
  test('si hay 2 históricos, no elimina ninguno', async () => {
    const eliminadosDb = [];
    const eliminadosStorage = [];
    prismaFalso.documentoVehiculo.findMany = async () => [
      { id: 10, archivoPath: 'path10', creadoEn: new Date('2026-03-01') },
      { id: 9, archivoPath: 'path9', creadoEn: new Date('2026-02-01') },
    ];
    prismaFalso.documentoVehiculo.delete = async ({ where }) => {
      eliminadosDb.push(where.id);
    };
    storageFalso.eliminarArchivo = async (p) => {
      eliminadosStorage.push(p);
    };

    await purgarHistorialExcedenteVehiculo(58, 1);

    assert.equal(eliminadosDb.length, 0);
    assert.equal(eliminadosStorage.length, 0);
  });

  test('si hay 4 históricos (supera límite de 2), elimina los 2 más viejos en DB y Storage', async () => {
    const eliminadosDb = [];
    const eliminadosStorage = [];
    prismaFalso.documentoVehiculo.findMany = async () => [
      { id: 10, archivoPath: 'vehiculos/58/doc10.pdf', creadoEn: new Date('2026-04-01') },
      { id: 9, archivoPath: 'vehiculos/58/doc9.pdf', creadoEn: new Date('2026-03-01') },
      { id: 8, archivoPath: 'vehiculos/58/doc8.pdf', creadoEn: new Date('2026-02-01') },
      { id: 7, archivoPath: 'vehiculos/58/doc7.pdf', creadoEn: new Date('2026-01-01') },
    ];
    prismaFalso.documentoVehiculo.delete = async ({ where }) => {
      eliminadosDb.push(where.id);
    };
    storageFalso.eliminarArchivo = async (p) => {
      eliminadosStorage.push(p);
    };

    await purgarHistorialExcedenteVehiculo(58, 1);

    // Debe conservar los 2 más nuevos (10 y 9) y eliminar los 2 más viejos (8 y 7)
    assert.deepEqual(eliminadosDb, [8, 7]);
    assert.deepEqual(eliminadosStorage, ['vehiculos/58/doc8.pdf', 'vehiculos/58/doc7.pdf']);
  });

  test('en choferes: si hay más de 2 históricos, elimina el más viejo en DB y Storage', async () => {
    const eliminadosDb = [];
    const eliminadosStorage = [];
    prismaFalso.documentoChofer.findMany = async () => [
      { id: 22, archivoPath: 'choferes/5/doc22.pdf', creadoEn: new Date('2026-03-01') },
      { id: 21, archivoPath: 'choferes/5/doc21.pdf', creadoEn: new Date('2026-02-01') },
      { id: 20, archivoPath: 'choferes/5/doc20.pdf', creadoEn: new Date('2026-01-01') },
    ];
    prismaFalso.documentoChofer.delete = async ({ where }) => {
      eliminadosDb.push(where.id);
    };
    storageFalso.eliminarArchivo = async (p) => {
      eliminadosStorage.push(p);
    };

    await purgarHistorialExcedenteChofer(5, 2);

    // Debe conservar 22 y 21, y purgar el más viejo (20)
    assert.deepEqual(eliminadosDb, [20]);
    assert.deepEqual(eliminadosStorage, ['choferes/5/doc20.pdf']);
  });
});
