// Tests de "el perfil Chofer implica estar habilitado para conducir" (H17 de
// docs/auditoria-ux/personal-usuarios.md, tanda 2, decisión del cliente). En el
// alta y en la edición, con perfil Chofer el backend guarda
// habilitadoParaConducir=true sin importar lo que mande el front. En la auditoría
// (G7), POST /personas con perfil CHOFER y habilitadoParaConducir=false daba 201
// con la persona sin habilitar. Pasar de Chofer a otro perfil conserva la
// habilitación; quitarla es deshabilitar (bajasChofer.test.js).
//
// Levantan la app real con un JWT real, la sesión tomada del token
// (helpers/sesionDelToken.js) y Prisma en memoria con estado
// (helpers/prismaFalsoCuentas.js): NO tocan la base ni leen el .env. La
// migración que habilita a los Choferes ya cargados corre en test:integracion.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');
const { crearCuentas } = require('./helpers/prismaFalsoCuentas');
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');

const { prisma, db, sembrar, perfilPorId } = crearCuentas();
instalarEnCache(SRC, prisma);
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

beforeEach(() => sembrar());

const ADMIN_EXTERNO = { id: 999, personaId: 999, perfil: 'ADMINISTRADOR' };

async function pedir(metodo, ruta, { body } = {}) {
  const token = generarToken({ ...ADMIN_EXTERNO, nombreUsuario: 'test-999', habilitadoParaConducir: false });
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const persona = (id) => db.personas.find((p) => p.id === id);

function datosDe(id, cambios = {}) {
  const p = persona(id);
  return { nombre: p.nombre, apellido: p.apellido, dni: p.dni, perfil: perfilPorId(p.perfilId).descripcion, ...cambios };
}

const alta = (perfil, extra = {}) =>
  pedir('POST', '/personas', { body: { nombre: 'Sergio', apellido: 'Ríos', dni: '31222333', perfil, ...extra } });

describe('H17: en el alta', () => {
  test('G7: Chofer con habilitadoParaConducir=false queda habilitado', async () => {
    const { status, json } = await alta('CHOFER', { habilitadoParaConducir: false });
    assert.equal(status, 201);
    assert.equal(json.persona.habilitadoParaConducir, true);
  });

  test('Chofer sin el campo, también', async () => {
    const { json } = await alta('CHOFER');
    assert.equal(json.persona.habilitadoParaConducir, true);
  });

  test('los otros perfiles toman lo que venga, y sin el campo no quedan habilitados', async () => {
    assert.equal((await alta('ENCARGADO', { habilitadoParaConducir: true })).json.persona.habilitadoParaConducir, true);
    db.personas.pop();
    assert.equal((await alta('PERSONAL_TALLER')).json.persona.habilitadoParaConducir, false);
  });
});

describe('H17: en la edición', () => {
  test('a un Chofer no se lo deshabilita por mandar false: queda habilitado', async () => {
    const { status, json } = await pedir('PUT', '/personas/14', { body: datosDe(14, { habilitadoParaConducir: false }) });
    assert.equal(status, 200);
    assert.equal(json.persona.habilitadoParaConducir, true);
    assert.equal(json.candidaturasQuitadas, 0);
  });

  test('aunque tenga viajes Programados: no es deshabilitar', async () => {
    db.viajes.push({ id: 6, estado: 'PROGRAMADO', choferId: 14, fechaInicio: new Date('2026-10-30T09:30:00Z') });
    const { status } = await pedir('PUT', '/personas/14', { body: datosDe(14, { habilitadoParaConducir: false }) });
    assert.equal(status, 200);
  });

  test('pasar a alguien a Chofer lo habilita, mande lo que mande', async () => {
    const { json } = await pedir('PUT', '/personas/7', { body: datosDe(7, { perfil: 'CHOFER', habilitadoParaConducir: false }) });
    assert.equal(json.persona.perfil, 'CHOFER');
    assert.equal(json.persona.habilitadoParaConducir, true);
  });

  test('pasar de Chofer a otro perfil conserva la habilitación si no viene', async () => {
    const { json } = await pedir('PUT', '/personas/14', { body: datosDe(14, { perfil: 'PERSONAL_TALLER' }) });
    assert.equal(json.persona.perfil, 'PERSONAL_TALLER');
    assert.equal(json.persona.habilitadoParaConducir, true);
  });

  test('pasar de Chofer a otro perfil y quitarla es deshabilitar: con Programados, 409', async () => {
    db.viajes.push({ id: 6, estado: 'PROGRAMADO', choferId: 14, fechaInicio: new Date('2026-10-30T09:30:00Z') });
    const { status, json } = await pedir('PUT', '/personas/14', {
      body: datosDe(14, { perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false }),
    });
    assert.equal(status, 409);
    assert.equal(json.error, 'Tiene 1 viaje programado. Reasignalo antes de deshabilitarla.');
    assert.equal(perfilPorId(persona(14).perfilId).descripcion, 'CHOFER');
  });

  test('y sin viajes, pasa', async () => {
    const { status, json } = await pedir('PUT', '/personas/14', {
      body: datosDe(14, { perfil: 'PERSONAL_TALLER', habilitadoParaConducir: false }),
    });
    assert.equal(status, 200);
    assert.equal(json.persona.habilitadoParaConducir, false);
  });
});
