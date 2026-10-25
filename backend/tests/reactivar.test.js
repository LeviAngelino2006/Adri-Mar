// Tests de la reactivación (H9 de docs/auditoria-ux/personal-usuarios.md, tanda 2):
// la salida para una baja o un bloqueo hechos por error, o para un reingreso. En
// la auditoría (G4 y G10) no había endpoint (404) y volver a registrar a la
// persona fallaba por el DNI.
//
// - PATCH /personas/:id/reactivar: activo=true y fechaBaja=null. NO reactiva la
//   cuenta.
// - PATCH /usuarios/:id/reactivar: solo si la persona está activa.
// - Los dos, Administrador y Encargado; un Encargado no actúa sobre
//   Administradores.
//
// Levantan la app real con un JWT real, la sesión tomada del token
// (helpers/sesionDelToken.js) y Prisma en memoria con estado
// (helpers/prismaFalsoCuentas.js): NO tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');
const { crearCuentas } = require('./helpers/prismaFalsoCuentas');
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');

const { prisma, db, sembrar, perfilPorId, estadoPorId } = crearCuentas();
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
const DIEGO = { id: 4, personaId: 4, perfil: 'ENCARGADO' };
const HUGO = { id: 7, personaId: 7, perfil: 'PERSONAL_TALLER' };
const RAMIRO = { id: 11, personaId: 14, perfil: 'CHOFER' };

async function pedir(metodo, ruta, { como = ADMIN_EXTERNO, body } = {}) {
  const token = generarToken({ ...como, nombreUsuario: `test-${como.id}`, habilitadoParaConducir: false });
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const persona = (id) => db.personas.find((p) => p.id === id);
const cuenta = (id) => db.usuarios.find((u) => u.id === id);
const estadoDe = (usuarioId) => estadoPorId(cuenta(usuarioId).estadoUsuarioId).descripcion;
const bloquear = (usuarioId) => {
  cuenta(usuarioId).estadoUsuarioId = 2;
};
const darDeBaja = (personaId) => Object.assign(persona(personaId), { activo: false, fechaBaja: new Date('2026-09-15T15:00:00Z') });

const NESTOR = 13; // Chofer dado de baja, con la cuenta 10 inactiva.

describe('H9: reactivar a una persona', () => {
  test('G4: el Administrador reactiva a Néstor; su cuenta sigue inactiva', async () => {
    const { status, json } = await pedir('PATCH', `/personas/${NESTOR}/reactivar`);

    assert.equal(status, 200);
    assert.equal(json.persona.activo, true);
    assert.equal(json.persona.fechaBaja, null);
    assert.equal(persona(NESTOR).activo, true);
    assert.equal(persona(NESTOR).fechaBaja, null);
    assert.equal(estadoDe(10), 'INACTIVO');
    assert.deepEqual(json.persona.usuario, { id: 10, nombreUsuario: 'nvega', activo: false });
  });

  test('conserva sus datos, y después ya se la puede editar', async () => {
    const antes = { ...persona(NESTOR) };
    await pedir('PATCH', `/personas/${NESTOR}/reactivar`);
    assert.equal(persona(NESTOR).dni, antes.dni);
    assert.equal(persona(NESTOR).perfilId, antes.perfilId);
    assert.equal(persona(NESTOR).habilitadoParaConducir, antes.habilitadoParaConducir);

    const p = persona(NESTOR);
    const { status } = await pedir('PUT', `/personas/${NESTOR}`, {
      body: { nombre: p.nombre, apellido: p.apellido, dni: p.dni, perfil: perfilPorId(p.perfilId).descripcion, telefono: '3571 40-1313' },
    });
    assert.equal(status, 200);
  });

  test('un Encargado reactiva a un Chofer', async () => {
    const { status } = await pedir('PATCH', `/personas/${NESTOR}/reactivar`, { como: DIEGO });
    assert.equal(status, 200);
    assert.equal(persona(NESTOR).activo, true);
  });

  test('un Encargado reactiva a otro Encargado', async () => {
    darDeBaja(3);
    const { status } = await pedir('PATCH', '/personas/3/reactivar', { como: DIEGO });
    assert.equal(status, 200);
  });

  test('un Encargado no reactiva a un Administrador (403); el Administrador sí', async () => {
    darDeBaja(2);

    const encargado = await pedir('PATCH', '/personas/2/reactivar', { como: DIEGO });
    assert.equal(encargado.status, 403);
    assert.equal(persona(2).activo, false);

    const admin = await pedir('PATCH', '/personas/2/reactivar');
    assert.equal(admin.status, 200);
    assert.equal(persona(2).activo, true);
  });

  test('Personal de Taller y Chofer no pueden (403)', async () => {
    for (const como of [HUGO, RAMIRO]) {
      const { status } = await pedir('PATCH', `/personas/${NESTOR}/reactivar`, { como });
      assert.equal(status, 403);
    }
    assert.equal(persona(NESTOR).activo, false);
  });

  test('una persona activa: 409; una que no existe: 404', async () => {
    const activa = await pedir('PATCH', '/personas/14/reactivar');
    assert.equal(activa.status, 409);
    assert.equal(activa.json.error, 'La persona ya está activa');

    assert.equal((await pedir('PATCH', '/personas/9999/reactivar')).status, 404);
  });
});

describe('H9: reactivar la cuenta', () => {
  test('con la persona dada de baja: 409 "Reactivá primero a la persona."', async () => {
    const { status, json } = await pedir('PATCH', '/usuarios/10/reactivar');

    assert.equal(status, 409);
    assert.equal(json.error, 'Reactivá primero a la persona.');
    assert.equal(estadoDe(10), 'INACTIVO');
  });

  test('Néstor completo: primero la persona y después la cuenta', async () => {
    await pedir('PATCH', `/personas/${NESTOR}/reactivar`);
    const { status, json } = await pedir('PATCH', '/usuarios/10/reactivar');

    assert.equal(status, 200);
    assert.equal(json.usuario.activo, true);
    assert.equal(estadoDe(10), 'ACTIVO');
  });

  test('la cuenta bloqueada de una persona activa (Ramiro) la reactiva un Encargado', async () => {
    bloquear(11);
    const { status } = await pedir('PATCH', '/usuarios/11/reactivar', { como: DIEGO });
    assert.equal(status, 200);
    assert.equal(estadoDe(11), 'ACTIVO');
  });

  test('un Encargado reactiva la de otro Encargado, como puede bloquearla', async () => {
    bloquear(3);
    const { status } = await pedir('PATCH', '/usuarios/3/reactivar', { como: DIEGO });
    assert.equal(status, 200);
  });

  test('un Encargado no reactiva la de un Administrador (403); el Administrador sí', async () => {
    bloquear(2);

    const encargado = await pedir('PATCH', '/usuarios/2/reactivar', { como: DIEGO });
    assert.equal(encargado.status, 403);
    assert.equal(estadoDe(2), 'INACTIVO');

    const admin = await pedir('PATCH', '/usuarios/2/reactivar');
    assert.equal(admin.status, 200);
    assert.equal(estadoDe(2), 'ACTIVO');
  });

  test('Personal de Taller y Chofer no pueden (403)', async () => {
    bloquear(11);
    for (const como of [HUGO, RAMIRO]) {
      const { status } = await pedir('PATCH', '/usuarios/11/reactivar', { como });
      assert.equal(status, 403);
    }
    assert.equal(estadoDe(11), 'INACTIVO');
  });

  test('una cuenta activa: 409; una que no existe: 404', async () => {
    const activa = await pedir('PATCH', '/usuarios/11/reactivar');
    assert.equal(activa.status, 409);
    assert.equal(activa.json.error, 'La cuenta ya está activa');

    assert.equal((await pedir('PATCH', '/usuarios/9999/reactivar')).status, 404);
  });
});
