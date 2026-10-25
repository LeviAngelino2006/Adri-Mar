// Tests de seguridad de Personal y Usuarios (tanda 1 de la auditoría,
// docs/auditoria-ux/personal-usuarios.md): el último Administrador (H2). Los
// escenarios salen de las pruebas contra la API de la auditoría (G2).
//
// Levantan la app real con un JWT real, la sesión tomada del token
// (helpers/sesionDelToken.js) y Prisma en memoria con estado
// (helpers/prismaFalsoCuentas.js): NO tocan la base ni leen el .env. La carrera
// entre dos cambios simultáneos se prueba contra la base real en
// test:integracion.

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

// Token de una sesión: la persona y el perfil de quien pide.
const tokenDe = ({ id, personaId, perfil }) =>
  generarToken({ id, personaId, nombreUsuario: `test-${id}`, perfil, habilitadoParaConducir: false });

// Un Administrador que no es ninguna de las personas sembradas: el que pide no
// cuenta como "otro Administrador activo". Es lo que queda para llegar al último
// Administrador una vez que nadie puede actuar sobre sí mismo (H3): un cambio
// hecho con datos viejos o al mismo tiempo que otro.
const ADMIN_EXTERNO = { id: 999, personaId: 999, perfil: 'ADMINISTRADOR' };

async function pedir(metodo, ruta, { como = ADMIN_EXTERNO, body } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe(como)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const persona = (id) => db.personas.find((p) => p.id === id);
const cuenta = (id) => db.usuarios.find((u) => u.id === id);
const perfilDe = (id) => perfilPorId(persona(id).perfilId).descripcion;
const estadoDe = (usuarioId) => estadoPorId(cuenta(usuarioId).estadoUsuarioId).descripcion;

// El cuerpo completo del PUT /personas/:id, con lo que se quiera cambiar.
function datosDe(id, cambios = {}) {
  const p = persona(id);
  return { nombre: p.nombre, apellido: p.apellido, dni: p.dni, perfil: perfilDe(id), habilitadoParaConducir: p.habilitadoParaConducir, ...cambios };
}

const ULTIMO_ADMIN = 'Tiene que quedar al menos un Administrador activo';

describe('H2: siempre queda un Administrador activo', () => {
  // Carlos con la cuenta bloqueada: Adriana es la única Administradora activa.
  const soloAdriana = () => {
    cuenta(2).estadoUsuarioId = 2;
  };

  test('no se le puede cambiar el perfil a la última Administradora activa', async () => {
    soloAdriana();
    const { status, json } = await pedir('PUT', '/personas/1', { body: datosDe(1, { perfil: 'ENCARGADO' }) });
    assert.equal(status, 409);
    assert.equal(json.error, ULTIMO_ADMIN);
    assert.equal(perfilDe(1), 'ADMINISTRADOR');
  });

  test('no se la puede dar de baja: la persona y la cuenta quedan como estaban', async () => {
    soloAdriana();
    const { status, json } = await pedir('PATCH', '/personas/1/baja');
    assert.equal(status, 409);
    assert.equal(json.error, ULTIMO_ADMIN);
    assert.equal(persona(1).activo, true);
    assert.equal(estadoDe(1), 'ACTIVO');
  });

  test('no se le puede bloquear la cuenta, ni por /baja ni por PUT activo=false', async () => {
    soloAdriana();
    const porBaja = await pedir('PATCH', '/usuarios/1/baja');
    const porPut = await pedir('PUT', '/usuarios/1', { body: { nombreUsuario: 'amartinez', activo: false } });
    assert.equal(porBaja.status, 409);
    assert.equal(porBaja.json.error, ULTIMO_ADMIN);
    assert.equal(porPut.status, 409);
    assert.equal(porPut.json.error, ULTIMO_ADMIN);
    assert.equal(estadoDe(1), 'ACTIVO');
  });

  test('G2: pasar a Carlos a Chofer anda, y después dar de baja a Adriana no', async () => {
    const carlos = await pedir('PUT', '/personas/2', { body: datosDe(2, { perfil: 'CHOFER' }) });
    assert.equal(carlos.status, 200);

    const adriana = await pedir('PATCH', '/personas/1/baja');
    assert.equal(adriana.status, 409);
    assert.equal(persona(1).activo, true);
  });

  test('con otro Administrador activo sí se puede, y el chequeo toma el lock', async () => {
    const { status } = await pedir('PUT', '/personas/1', { body: datosDe(1, { perfil: 'ENCARGADO' }) });
    assert.equal(status, 200);
    assert.equal(perfilDe(1), 'ENCARGADO');
    assert.equal(db.locks.length, 1);
    assert.match(db.locks[0].sql, /pg_advisory_xact_lock/);
  });

  test('un Administrador que no está activo (cuenta bloqueada) no cuenta: se lo puede cambiar sin lock', async () => {
    soloAdriana();
    const { status } = await pedir('PUT', '/personas/2', { body: datosDe(2, { perfil: 'CHOFER' }) });
    assert.equal(status, 200);
    assert.equal(db.locks.length, 0);
  });

  test('los cambios sobre quien no es Administrador no pasan por el chequeo', async () => {
    const baja = await pedir('PATCH', '/usuarios/11/baja');
    const perfil = await pedir('PUT', '/personas/14', { body: datosDe(14, { perfil: 'PERSONAL_TALLER' }) });
    assert.equal(baja.status, 200);
    assert.equal(perfil.status, 200);
    assert.equal(db.locks.length, 0);
  });
});
