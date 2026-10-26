// Tests de bloqueo de vehículos y choferes con documentación vencida al planificar,
// confirmar y editar viajes en Adri-Mar Gestión.
//
// Verifica:
//  - Rechazo (400) al confirmar o editar viaje con vehículo con documento vencido.
//  - Rechazo (400) al confirmar o editar viaje con chofer (Persona) con documento vencido.
//  - Éxito (200) cuando el titular tiene un documento viejo vencido pero una versión nueva vigente del mismo tipo.
//  - Inclusión de disponible: false y motivo por documentación vencida en la consulta de disponibilidad de candidatos.
//  - Inclusión de disponible: false y motivo en disponibles-chofer.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache, ESTADOS, cba, idsDe } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar, agregarViaje, filaPorId } = crearEntorno();
const { viajes, candChofer, candVeh, documentos } = db;

instalarEnCache(SRC, prismaFalso);

const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
instalarSesionDelToken(SRC);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  sembrar();
  documentos.length = 0;
});

function tokenDe(perfil) {
  return generarToken({ id: 10, personaId: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });
}

async function pedir(metodo, ruta, { perfil = 'ENCARGADO', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) headers.Authorization = `Bearer ${tokenDe(perfil)}`;
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

function agregarDoc({ vehiculoId, choferId, tipoDocumentoId, fechaVencimiento, creadoEn = new Date() }) {
  const doc = {
    id: documentos.length + 1,
    vehiculoId: vehiculoId ?? null,
    choferId: choferId ?? null,
    tipoDocumentoId,
    fechaEmision: new Date('2026-01-01T12:00:00Z'),
    fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
    archivoPath: 'test.pdf',
    nombreArchivo: 'test.pdf',
    observaciones: null,
    usuarioId: 10,
    creadoEn: new Date(creadoEn),
  };
  documentos.push(doc);
  return doc;
}

const CONFIRMACION = { choferId: 5, vehiculoId: 7, fechaFin: '2026-10-20T12:00', kilometrosEstimados: 150 };

describe('Regla de negocio: Bloqueo de documentación vencida en viajes', () => {
  describe('Confirmación de viaje (PATCH /viajes/:id/confirmar)', () => {
    test('rechaza con 400 cuando el vehículo tiene documentación vencida (ITV)', async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 7, // ITV
        fechaVencimiento: '2026-01-01',
        creadoEn: '2026-01-01T00:00:00Z',
      });

      const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
        body: CONFIRMACION,
      });

      assert.equal(status, 400);
      assert.equal(
        json.errores.vehiculoId,
        'No se puede asignar el vehículo: tiene documentación vencida (ITV)'
      );
      // El viaje y sus candidatos quedan intactos
      assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.A_CONFIRMAR);
      assert.equal(filaPorId(viaje.id).vehiculoId, null);
      assert.deepEqual(idsDe(candVeh, 'vehiculoId', viaje.id), [7]);
    });

    test('rechaza con 400 cuando el chofer (Persona) tiene documentación vencida (Licencia de conducir)', async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });
      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4, // LICENCIA_CONDUCIR
        fechaVencimiento: '2026-01-01',
        creadoEn: '2026-01-01T00:00:00Z',
      });

      const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
        body: CONFIRMACION,
      });

      assert.equal(status, 400);
      assert.equal(
        json.errores.choferId,
        'No se puede asignar el chofer: tiene documentación vencida (Licencia de conducir)'
      );
      // El viaje y sus candidatos quedan intactos
      assert.equal(filaPorId(viaje.id).estadoViajeId, ESTADOS.A_CONFIRMAR);
      assert.equal(filaPorId(viaje.id).choferId, null);
      assert.deepEqual(idsDe(candChofer, 'personaId', viaje.id), [5]);
    });

    test('éxito (200) cuando el titular tiene un documento viejo vencido pero una versión nueva vigente del mismo tipo', async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });
      // Chofer 5: versión vieja vencida y versión nueva vigente
      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4,
        fechaVencimiento: '2026-01-01',
        creadoEn: '2026-01-01T00:00:00Z',
      });
      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4,
        fechaVencimiento: '2027-10-01',
        creadoEn: '2026-06-01T00:00:00Z',
      });

      // Vehículo 7: versión vieja vencida y versión nueva vigente
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 7,
        fechaVencimiento: '2026-01-01',
        creadoEn: '2026-01-01T00:00:00Z',
      });
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 7,
        fechaVencimiento: '2027-10-01',
        creadoEn: '2026-06-01T00:00:00Z',
      });

      const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
        body: CONFIRMACION,
      });

      assert.equal(status, 200);
      assert.equal(json.viaje.estado, 'PROGRAMADO');
      assert.equal(json.viaje.choferId, 5);
      assert.equal(json.viaje.vehiculoId, 7);
    });

    test('documentos sin fecha de vencimiento nunca bloquean', async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });
      // Título de vehículo sin fecha de vencimiento
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 3, // TITULO_VEHICULO
        fechaVencimiento: null,
      });

      const { status } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
        body: CONFIRMACION,
      });

      assert.equal(status, 200);
    });
  });

  describe('Edición de viaje programado (PUT /viajes/:id)', () => {
    test('rechaza con 400 al cambiar a un vehículo con ITV vencida en viaje PROGRAMADO', async () => {
      const viaje = agregarViaje({
        estado: 'PROGRAMADO',
        choferId: 5,
        vehiculoId: 7,
        fechaInicio: cba('08:00'),
        fechaFin: cba('12:00'),
        kilometrosEstimados: 100,
      });

      // Vehículo 9 tiene ITV vencida
      agregarDoc({
        vehiculoId: 9,
        tipoDocumentoId: 7,
        fechaVencimiento: '2026-01-01',
      });

      const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
        body: {
          clienteId: 1,
          origenId: 1,
          destinoId: 2,
          choferId: 5,
          vehiculoId: 9,
          fechaInicio: '2026-10-20T08:00',
          fechaFin: '2026-10-20T12:00',
          kilometrosEstimados: 100,
        },
      });

      assert.equal(status, 400);
      assert.equal(
        json.errores.vehiculoId,
        'No se puede asignar el vehículo: tiene documentación vencida (ITV)'
      );
      assert.equal(filaPorId(viaje.id).vehiculoId, 7);
    });

    test('rechaza con 400 al cambiar a un chofer con Licencia vencida en viaje PROGRAMADO', async () => {
      const viaje = agregarViaje({
        estado: 'PROGRAMADO',
        choferId: 5,
        vehiculoId: 7,
        fechaInicio: cba('08:00'),
        fechaFin: cba('12:00'),
        kilometrosEstimados: 100,
      });

      // Chofer 6 tiene Licencia vencida
      agregarDoc({
        choferId: 6,
        tipoDocumentoId: 4,
        fechaVencimiento: '2026-01-01',
      });

      const { status, json } = await pedir('PUT', `/viajes/${viaje.id}`, {
        body: {
          clienteId: 1,
          origenId: 1,
          destinoId: 2,
          choferId: 6,
          vehiculoId: 7,
          fechaInicio: '2026-10-20T08:00',
          fechaFin: '2026-10-20T12:00',
          kilometrosEstimados: 100,
        },
      });

      assert.equal(status, 400);
      assert.equal(
        json.errores.choferId,
        'No se puede asignar el chofer: tiene documentación vencida (Licencia de conducir)'
      );
      assert.equal(filaPorId(viaje.id).choferId, 5);
    });
  });

  describe('Consulta de disponibilidad de candidatos (GET /viajes/:id/disponibilidad y POST /viajes/disponibilidad)', () => {
    test('marca disponible: false y motivo detallado en candidatos de viaje existente', async () => {
      const viaje = agregarViaje({ choferesCandidatos: [5, 6], vehiculosCandidatos: [7, 9] });

      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4, // Licencia de conducir
        fechaVencimiento: '2026-01-01',
      });
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 7, // ITV
        fechaVencimiento: '2026-01-01',
      });

      const { status, json } = await pedir('GET', `/viajes/${viaje.id}/disponibilidad`);

      assert.equal(status, 200);

      const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
      const choferes = porId(json.choferes);
      const vehiculos = porId(json.vehiculos);

      assert.equal(choferes[5].disponible, false);
      assert.equal(choferes[5].motivo, 'Documentación vencida (Licencia de conducir)');
      assert.equal(choferes[6].disponible, true);
      assert.equal(choferes[6].motivo, null);

      assert.equal(vehiculos[7].disponible, false);
      assert.equal(vehiculos[7].motivo, 'Documentación vencida (ITV)');
      assert.equal(vehiculos[9].disponible, true);
      assert.equal(vehiculos[9].motivo, null);
    });

    test('marca disponible: false y motivo en consulta de disponibilidad para alta', async () => {
      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4,
        fechaVencimiento: '2026-01-01',
      });
      agregarDoc({
        vehiculoId: 7,
        tipoDocumentoId: 7,
        fechaVencimiento: '2026-01-01',
      });

      const { status, json } = await pedir('POST', '/viajes/disponibilidad', {
        body: {
          fechaInicio: '2026-10-20T08:00',
          fechaFin: '2026-10-20T12:00',
          choferIds: [5, 6],
          vehiculoIds: [7, 9],
        },
      });

      assert.equal(status, 200);
      const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
      const choferes = porId(json.choferes);
      const vehiculos = porId(json.vehiculos);

      assert.equal(choferes[5].disponible, false);
      assert.equal(choferes[5].motivo, 'Documentación vencida (Licencia de conducir)');
      assert.equal(choferes[6].disponible, true);

      assert.equal(vehiculos[7].disponible, false);
      assert.equal(vehiculos[7].motivo, 'Documentación vencida (ITV)');
      assert.equal(vehiculos[9].disponible, true);
    });
  });

  describe('Consulta de choferes disponibles (/personas/disponibles-chofer)', () => {
    test('marca disponible: false y motivo cuando un chofer tiene documentación vencida', async () => {
      agregarDoc({
        choferId: 5,
        tipoDocumentoId: 4,
        fechaVencimiento: '2026-01-01',
      });

      const { status, json } = await pedir('GET', '/personas/disponibles-chofer');

      assert.equal(status, 200);
      const chofer5 = json.personas.find((p) => p.id === 5);
      assert.ok(chofer5);
      assert.equal(chofer5.disponible, false);
      assert.equal(chofer5.motivo, 'Documentación vencida (Licencia de conducir)');

      const chofer6 = json.personas.find((p) => p.id === 6);
      assert.ok(chofer6);
      assert.notEqual(chofer6.disponible, false);
    });
  });
});
