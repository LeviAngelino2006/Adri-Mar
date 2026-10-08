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
  documentoUsuario: {
    findMany: async () => [],
    create: async ({ data }) => ({ id: 1, ...data }),
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const { calcularEstadoDocumento } = require(path.join(SRC, 'services', 'documentoService.js'));

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
