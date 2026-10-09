// Tests del teléfono del chofer en la respuesta del viaje (Fase 4): lo necesitan
// los gestores para avisarle al chofer por WhatsApp, y es un dato personal que
// no tiene que llegar a los demás perfiles.
//
// Levantan la app real de Express con un JWT real y el doble con estado de
// helpers/prismaFalsoConEstado.js. NO tocan la base ni leen el .env.
// Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, sembrar, agregarViaje } = crearEntorno();

instalarEnCache(SRC, prismaFalso);

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
});

function tokenDe(perfil) {
  return generarToken({ id: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });
}

async function pedir(metodo, ruta, { perfil, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (perfil) headers.Authorization = `Bearer ${tokenDe(perfil)}`;
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

describe('chofer.telefono en la respuesta del viaje', () => {
  for (const perfil of ['ADMINISTRADOR', 'ENCARGADO']) {
    test(`${perfil} recibe el teléfono del chofer en el listado`, async () => {
      agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

      const { status, json } = await pedir('GET', '/viajes', { perfil });

      assert.equal(status, 200);
      assert.deepEqual(json.viajes[0].chofer, {
        id: 5,
        nombre: 'Ana',
        apellido: 'Pérez',
        telefono: '03571 15-612345',
      });
    });
  }

  test('un chofer sin teléfono cargado llega como null para un gestor (no se omite la clave)', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 6, vehiculoId: 7 });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ENCARGADO' });

    assert.equal(json.viajes[0].chofer.telefono, null);
  });

  test('PERSONAL_TALLER ve el chofer pero SIN la clave telefono', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

    const { status, json } = await pedir('GET', '/viajes', { perfil: 'PERSONAL_TALLER' });

    assert.equal(status, 200);
    assert.deepEqual(json.viajes[0].chofer, { id: 5, nombre: 'Ana', apellido: 'Pérez' });
    assert.ok(!('telefono' in json.viajes[0].chofer));
  });

  test('un CHOFER no recibe teléfono en /mis-viajes', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 10, vehiculoId: 7 });

    const { status, json } = await pedir('GET', '/viajes/mis-viajes', { perfil: 'CHOFER' });

    assert.equal(status, 200);
    assert.ok(!('telefono' in json.viajes[0].chofer));
  });

  test('la respuesta de confirmar (que usa el botón de WhatsApp) trae el teléfono del chofer elegido', async () => {
    const viaje = agregarViaje({ choferesCandidatos: [5], vehiculosCandidatos: [7] });

    const { status, json } = await pedir('PATCH', `/viajes/${viaje.id}/confirmar`, {
      perfil: 'ENCARGADO',
      body: { choferId: 5, vehiculoId: 7, fechaFin: '2026-10-20T12:00', kilometrosEstimados: 150 },
    });

    assert.equal(status, 200);
    assert.equal(json.viaje.chofer.telefono, '03571 15-612345');
  });

  test('un viaje A_CONFIRMAR (sin chofer asignado) sigue devolviendo chofer null', async () => {
    agregarViaje({ choferesCandidatos: [5] });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    assert.equal(json.viajes[0].chofer, null);
  });

  test('los teléfonos de los candidatos NO se exponen: solo el del chofer asignado', async () => {
    agregarViaje({ choferesCandidatos: [5, 6] });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    for (const candidato of json.viajes[0].choferesCandidatos) {
      assert.ok(!('telefono' in candidato), 'un candidato no lleva teléfono');
    }
  });

  test('el teléfono viaja igual en viajes En viaje y Finalizado', async () => {
    agregarViaje({ estado: 'EN_VIAJE', choferId: 5, vehiculoId: 7 });
    agregarViaje({ estado: 'FINALIZADO', choferId: 6, vehiculoId: 7 });

    const { json } = await pedir('GET', '/viajes', { perfil: 'ADMINISTRADOR' });

    assert.deepEqual(json.viajes.map((v) => v.chofer.telefono).sort(), ['03571 15-612345', null].sort());
  });
});
