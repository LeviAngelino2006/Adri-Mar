// Tests de la persona dada de baja (H12 de docs/auditoria-ux/personal-usuarios.md,
// tanda 2, decisión del cliente): sus datos son de solo consulta, como los de un
// vehículo dado de baja. Editarla o tocar su cuenta responde 409 "Reactivá
// primero a la persona.". En la auditoría (G4), PUT /personas/13 con Néstor dado
// de baja respondía 200.
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

function datosDe(id, cambios = {}) {
  const p = persona(id);
  return {
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni,
    perfil: perfilPorId(p.perfilId).descripcion,
    habilitadoParaConducir: p.habilitadoParaConducir,
    ...cambios,
  };
}

const NESTOR = 13; // Chofer dado de baja, con la cuenta 10 inactiva.
const REACTIVA_PRIMERO = 'Reactivá primero a la persona.';

describe('H12: los datos de una persona dada de baja son de solo consulta', () => {
  test('G4: editar a Néstor da 409 y no cambia nada', async () => {
    const { status, json } = await pedir('PUT', `/personas/${NESTOR}`, {
      body: datosDe(NESTOR, { telefono: '3571 40-1313', email: 'nestor@adrimar.com' }),
    });

    assert.equal(status, 409);
    assert.equal(json.error, REACTIVA_PRIMERO);
    assert.equal(persona(NESTOR).telefono, null);
    assert.equal(persona(NESTOR).email, null);
  });

  test('también si el formulario viene igual que lo guardado', async () => {
    const { status } = await pedir('PUT', `/personas/${NESTOR}`, { body: datosDe(NESTOR) });
    assert.equal(status, 409);
  });

  test('un Encargado sobre un Administrador dado de baja sigue recibiendo 403', async () => {
    persona(2).activo = false;
    const { status } = await pedir('PUT', '/personas/2', { como: DIEGO, body: datosDe(2) });
    assert.equal(status, 403);
  });

  test('una persona activa se sigue editando', async () => {
    const { status } = await pedir('PUT', '/personas/14', { body: datosDe(14, { telefono: '3571 40-1414' }) });
    assert.equal(status, 200);
    assert.equal(persona(14).telefono, '3571 40-1414');
  });

  test('darla de baja otra vez sigue siendo 409 "ya está inactiva"', async () => {
    const { status, json } = await pedir('PATCH', `/personas/${NESTOR}/baja`);
    assert.equal(status, 409);
    assert.equal(json.error, 'La persona ya está inactiva');
  });
});

describe('H12: la cuenta de una persona dada de baja, también', () => {
  test('cualquier PUT /usuarios/:id da 409, aunque no cambie nada', async () => {
    const igual = await pedir('PUT', '/usuarios/10', { body: { nombreUsuario: 'nvega' } });
    assert.equal(igual.status, 409);
    assert.equal(igual.json.error, REACTIVA_PRIMERO);

    const bloquear = await pedir('PUT', '/usuarios/10', { body: { nombreUsuario: 'nvega', activo: false } });
    assert.equal(bloquear.status, 409);
    assert.equal(estadoPorId(cuenta(10).estadoUsuarioId).descripcion, 'INACTIVO');
  });
});
