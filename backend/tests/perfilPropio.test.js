// Tests de perfil propio (SCRUM-259, SCRUM-275):
// - GET /api/auth/perfil devuelve los datos básicos propios de la cuenta
//   autenticada sin exponer contrasenaHash, para todos los perfiles.
// - Expone ultimoIngreso (o null si nunca ingresó desde que se registra) y creadoEn.
// - Sin token, con cuenta bloqueada o persona dada de baja responde 401.
// - Con contraseña provisoria responde 403 DEBE_CAMBIAR_CONTRASENA.
// - Se integra con PUT /api/auth/contrasena y POST /api/auth/login.
//
// Usan el sesionService REAL con Prisma en memoria (helpers/prismaFalsoCuentas.js):
// NO tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');
const { crearCuentas } = require('./helpers/prismaFalsoCuentas');

const { prisma, db, sembrar } = crearCuentas();
instalarEnCache(SRC, prisma);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const { limiteLogin, limiteCambioContrasena } = require(path.join(SRC, 'middlewares', 'limiteLogin.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

const CLAVE = 'clave-actual-1';
const HASH_CLAVE = bcrypt.hashSync(CLAVE, 4);

beforeEach(() => {
  sembrar();
  for (const u of db.usuarios) u.contrasenaHash = HASH_CLAVE;
  limiteLogin.reiniciar();
  limiteCambioContrasena.reiniciar();
});

const cuenta = (id) => db.usuarios.find((u) => u.id === id);
const persona = (id) => db.personas.find((p) => p.id === id);

function tokenDe(usuarioId) {
  const u = cuenta(usuarioId);
  return generarToken({
    id: u.id,
    personaId: u.personaId,
    nombreUsuario: u.nombreUsuario,
    perfil: 'CHOFER',
    habilitadoParaConducir: true,
  });
}

async function pedir(metodo, ruta, { usuarioId = 1, token = tokenDe(usuarioId), body } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await respuesta.json();
  } catch {
    // Sin cuerpo JSON.
  }
  return { status: respuesta.status, json, renovado: respuesta.headers.get('x-renewed-token') };
}

const ADRIANA = 1; // ADMINISTRADOR
const DIEGO = 4; // ENCARGADO
const RAMIRO = 11; // CHOFER (personaId 14)

describe('GET /api/auth/perfil (SCRUM-259, SCRUM-275)', () => {
  test('devuelve los datos propios sin exponer contrasenaHash', async () => {
    const { status, json, renovado } = await pedir('GET', '/auth/perfil', { usuarioId: RAMIRO });
    assert.equal(status, 200);
    assert.ok(renovado);
    assert.deepEqual(json.usuario, {
      id: 11,
      personaId: 14,
      nombre: 'Ramiro',
      apellido: 'Acosta',
      nombreUsuario: 'racosta',
      perfil: 'CHOFER',
      habilitadoParaConducir: true,
      debeCambiarContrasena: false,
      ultimoIngreso: null,
      creadoEn: '2026-03-02T12:00:00.000Z',
    });
    assert.equal('contrasenaHash' in json.usuario, false);
  });

  test('funciona para todos los perfiles y devuelve la cuenta del token', async () => {
    // Hugo (persona 7, PERSONAL_TALLER) no tiene cuenta inicial: se le agrega una.
    db.usuarios.push({ ...cuenta(DIEGO), id: 7, personaId: 7, nombreUsuario: 'hpaz' });

    const casos = [
      [ADRIANA, 'amartinez', 'ADMINISTRADOR'],
      [DIEGO, 'dsosa', 'ENCARGADO'],
      [7, 'hpaz', 'PERSONAL_TALLER'],
      [RAMIRO, 'racosta', 'CHOFER'],
    ];

    for (const [usuarioId, nombreUsuario, perfilEsperado] of casos) {
      const { status, json } = await pedir('GET', '/auth/perfil', { usuarioId });
      assert.equal(status, 200);
      assert.equal(json.usuario.nombreUsuario, nombreUsuario);
      assert.equal(json.usuario.perfil, perfilEsperado);
    }
  });

  test('devuelve ultimoIngreso cuando existe (y luego de un login exitoso)', async () => {
    const loginRes = await pedir('POST', '/auth/login', {
      token: null,
      body: { nombreUsuario: 'dsosa', contrasena: CLAVE },
    });
    assert.equal(loginRes.status, 200);

    const { status, json } = await pedir('GET', '/auth/perfil', { token: loginRes.json.token });
    assert.equal(status, 200);
    assert.ok(typeof json.usuario.ultimoIngreso === 'string');
    assert.ok(!Number.isNaN(Date.parse(json.usuario.ultimoIngreso)));
  });

  test('sin token, con cuenta bloqueada o persona dada de baja responde 401', async () => {
    assert.equal((await pedir('GET', '/auth/perfil', { token: null })).status, 401);

    const tokenRamiro = tokenDe(RAMIRO);
    cuenta(RAMIRO).estadoUsuarioId = 2; // INACTIVO
    assert.equal((await pedir('GET', '/auth/perfil', { token: tokenRamiro })).status, 401);

    const tokenDiego = tokenDe(DIEGO);
    persona(DIEGO).activo = false;
    assert.equal((await pedir('GET', '/auth/perfil', { token: tokenDiego })).status, 401);
  });

  test('con contraseña provisoria responde 403 DEBE_CAMBIAR_CONTRASENA', async () => {
    cuenta(RAMIRO).debeCambiarContrasena = true;
    const { status, json } = await pedir('GET', '/auth/perfil', { usuarioId: RAMIRO });
    assert.equal(status, 403);
    assert.equal(json.codigo, 'DEBE_CAMBIAR_CONTRASENA');
  });

  test('flujo integrado con cambio de contraseña propia y nuevo login', async () => {
    const perfilRes = await pedir('GET', '/auth/perfil', { usuarioId: DIEGO });
    assert.equal(perfilRes.status, 200);

    const falloRes = await pedir('PUT', '/auth/contrasena', {
      usuarioId: DIEGO,
      body: { contrasenaActual: 'otra-clave', contrasenaNueva: 'nueva-clave-99' },
    });
    assert.equal(falloRes.status, 400);
    assert.deepEqual(falloRes.json.errores, { contrasenaActual: 'La contraseña actual no es correcta' });

    const okRes = await pedir('PUT', '/auth/contrasena', {
      usuarioId: DIEGO,
      body: { contrasenaActual: CLAVE, contrasenaNueva: 'nueva-clave-99' },
    });
    assert.equal(okRes.status, 200);

    const loginViejo = await pedir('POST', '/auth/login', {
      token: null,
      body: { nombreUsuario: 'dsosa', contrasena: CLAVE },
    });
    assert.equal(loginViejo.status, 401);

    const loginNuevo = await pedir('POST', '/auth/login', {
      token: null,
      body: { nombreUsuario: 'dsosa', contrasena: 'nueva-clave-99' },
    });
    assert.equal(loginNuevo.status, 200);
  });
});
