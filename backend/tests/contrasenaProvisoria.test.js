// Tests de la contraseña provisoria y del cambio de la propia contraseña (H11 de
// docs/auditoria-ux/personal-usuarios.md, tanda 2, decisión del cliente):
//
// - Cuando un gestor crea una cuenta o le cambia la contraseña a otro, queda
//   debeCambiarContrasena=true.
// - Mientras esté en true, la cuenta solo puede usar GET /auth/me y PUT
//   /auth/contrasena: todo lo demás responde 403 con el código
//   DEBE_CAMBIAR_CONTRASENA. Lo decide autenticar, en un solo lugar: el test
//   recorre TODAS las rutas de la app.
// - PUT /auth/contrasena pide la actual y la nueva (mismas reglas que el alta),
//   para todos los perfiles, y deja el flag en false.
//
// Usan el sesionService REAL (la sesión de cada pedido sale del doble de la base,
// no del token), así un cambio hecho por otro vale desde el próximo pedido. Prisma
// en memoria con estado (helpers/prismaFalsoCuentas.js): NO tocan la base ni leen
// el .env. El mismo bloqueo contra la base real está en test:integracion.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

// Contraseñas reales (bcrypt con 4 rondas, para que sea rápido) en las cuentas
// que cambian la suya.
const CLAVE = 'clave-actual-1';
const HASH_CLAVE = bcrypt.hashSync(CLAVE, 4);

beforeEach(() => {
  sembrar();
  for (const u of db.usuarios) u.contrasenaHash = HASH_CLAVE;
  limiteLogin.reiniciar();
  limiteCambioContrasena.reiniciar();
});

const cuenta = (id) => db.usuarios.find((u) => u.id === id);

// El token de la cuenta (como lo firmaría el login). La sesión real la arma
// autenticar desde la base en cada pedido.
function tokenDe(usuarioId) {
  const u = cuenta(usuarioId);
  return generarToken({ id: u.id, personaId: u.personaId, nombreUsuario: u.nombreUsuario, perfil: 'CHOFER', habilitadoParaConducir: true });
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

const ADRIANA = 1; // Administradora.
const CARLOS = 2; // Administrador.
const DIEGO = 4; // Encargado.
const RAMIRO = 11; // Cuenta de Ramiro (persona 14, Chofer).

const BLOQUEADA = { error: 'Tenés que cambiar tu contraseña antes de seguir.', codigo: 'DEBE_CAMBIAR_CONTRASENA' };
const cambiar = (usuarioId, contrasenaActual, contrasenaNueva) =>
  pedir('PUT', '/auth/contrasena', { usuarioId, body: { contrasenaActual, contrasenaNueva } });

describe('H11: cuándo la contraseña queda provisoria', () => {
  test('un gestor crea una cuenta: provisoria', async () => {
    db.personas.push({ ...db.personas.find((p) => p.id === 7), id: 8, dni: '30000008' });
    const { status, json } = await pedir('POST', '/usuarios', {
      body: { personaId: 8, nombreUsuario: 'hpaz2', contrasena: 'provisoria-1' },
    });
    assert.equal(status, 201);
    assert.equal(json.usuario.debeCambiarContrasena, true);
    assert.equal(db.usuarios.find((u) => u.nombreUsuario === 'hpaz2').debeCambiarContrasena, true);
  });

  test('un gestor le cambia la contraseña a otro: provisoria', async () => {
    const { status } = await pedir('PUT', `/usuarios/${RAMIRO}`, { body: { nombreUsuario: 'racosta', contrasena: 'provisoria-1' } });
    assert.equal(status, 200);
    assert.equal(cuenta(RAMIRO).debeCambiarContrasena, true);
  });

  test('cambiarle solo el nombre de usuario no la vuelve provisoria', async () => {
    await pedir('PUT', `/usuarios/${RAMIRO}`, { body: { nombreUsuario: 'ramiro.acosta' } });
    assert.equal(cuenta(RAMIRO).debeCambiarContrasena, false);
  });

  test('un Administrador que se cambia la suya desde Usuarios no queda con provisoria', async () => {
    const { status } = await pedir('PUT', `/usuarios/${ADRIANA}`, { body: { nombreUsuario: 'amartinez', contrasena: 'nueva-clave-1' } });
    assert.equal(status, 200);
    assert.equal(cuenta(ADRIANA).debeCambiarContrasena, false);
  });
});

describe('H11: con la contraseña provisoria, solo /auth/me y el cambio', () => {
  beforeEach(() => {
    cuenta(RAMIRO).debeCambiarContrasena = true;
    cuenta(CARLOS).debeCambiarContrasena = true;
  });

  test('/auth/me responde, con el flag, y renueva el token', async () => {
    const { status, json, renovado } = await pedir('GET', '/auth/me', { usuarioId: RAMIRO });
    assert.equal(status, 200);
    assert.equal(json.usuario.debeCambiarContrasena, true);
    assert.ok(renovado);
  });

  test('otro endpoint: 403 con el código, y el token se renueva igual (la sesión sigue)', async () => {
    const { status, json, renovado } = await pedir('GET', '/personas', { usuarioId: CARLOS });
    assert.equal(status, 403);
    assert.deepEqual(json, BLOQUEADA);
    assert.ok(renovado);
  });

  test('el login funciona y avisa que la tiene que cambiar', async () => {
    const { status, json } = await pedir('POST', '/auth/login', { token: null, body: { nombreUsuario: 'racosta', contrasena: CLAVE } });
    assert.equal(status, 200);
    assert.equal(json.usuario.debeCambiarContrasena, true);
  });

  test('TODAS las rutas de la app, salvo /auth/me y el cambio, responden 403 con el código', async () => {
    const rutas = rutasDeLaApp();
    // Que el armado no haya dejado afuera ningún archivo de rutas (15 hoy).
    const prefijos = new Set(rutas.map((r) => r.ruta.split('/').slice(0, 3).join('/')));
    assert.ok(prefijos.size >= 15, `rutas de ${prefijos.size} prefijos: ${[...prefijos].join(', ')}`);
    const noBloqueadas = [];
    for (const { metodo, ruta } of rutas) {
      const conParametros = ruta.replace(/^\/api/, '').replace(/:\w+/g, '1');
      const body = metodo === 'GET' ? undefined : {};
      const { status, json } = await pedir(metodo, conParametros, { usuarioId: CARLOS, body });
      if (status !== 403 || json?.codigo !== 'DEBE_CAMBIAR_CONTRASENA') noBloqueadas.push(`${metodo} ${ruta}`);
    }
    // El login no pasa por autenticar: no hay sesión todavía.
    assert.deepEqual(noBloqueadas.sort(), ['GET /api/auth/me', 'POST /api/auth/login', 'PUT /api/auth/contrasena']);
  });

  test('después de cambiarla, el mismo token vuelve a andar', async () => {
    assert.equal((await pedir('GET', '/personas', { usuarioId: CARLOS })).status, 403);

    const cambio = await cambiar(CARLOS, CLAVE, 'clave-nueva-de-carlos');
    assert.equal(cambio.status, 200);

    const despues = await pedir('GET', '/personas', { usuarioId: CARLOS });
    assert.equal(despues.status, 200);
    assert.ok(Array.isArray(despues.json.personas));
  });

  test('si un gestor se la cambia con la sesión abierta, queda bloqueada desde el próximo pedido', async () => {
    cuenta(CARLOS).debeCambiarContrasena = false;
    assert.equal((await pedir('GET', '/personas', { usuarioId: CARLOS })).status, 200);

    await pedir('PUT', `/usuarios/${CARLOS}`, { usuarioId: ADRIANA, body: { nombreUsuario: 'cferreyra', contrasena: 'provisoria-1' } });

    const { status, json } = await pedir('GET', '/personas', { usuarioId: CARLOS });
    assert.equal(status, 403);
    assert.equal(json.codigo, 'DEBE_CAMBIAR_CONTRASENA');
  });
});

describe('H11: cambiar la propia contraseña', () => {
  test('con la actual incorrecta: 400 en el campo, y no cambia nada', async () => {
    cuenta(RAMIRO).debeCambiarContrasena = true;
    const { status, json } = await cambiar(RAMIRO, 'no-es-esta', 'clave-nueva-1');
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { contrasenaActual: 'La contraseña actual no es correcta' });
    assert.equal(cuenta(RAMIRO).contrasenaHash, HASH_CLAVE);
    assert.equal(cuenta(RAMIRO).debeCambiarContrasena, true);
  });

  test('con la correcta: 200, la nueva queda guardada y el flag en false', async () => {
    cuenta(RAMIRO).debeCambiarContrasena = true;
    const { status, json } = await cambiar(RAMIRO, CLAVE, 'clave-nueva-1');

    assert.equal(status, 200);
    assert.equal(json.usuario.debeCambiarContrasena, false);
    assert.equal(json.usuario.nombreUsuario, 'racosta');
    assert.equal(cuenta(RAMIRO).debeCambiarContrasena, false);
    assert.ok(await bcrypt.compare('clave-nueva-1', cuenta(RAMIRO).contrasenaHash));

    const viejo = await pedir('POST', '/auth/login', { token: null, body: { nombreUsuario: 'racosta', contrasena: CLAVE } });
    assert.equal(viejo.status, 401);
    const nuevo = await pedir('POST', '/auth/login', { token: null, body: { nombreUsuario: 'racosta', contrasena: 'clave-nueva-1' } });
    assert.equal(nuevo.status, 200);
    assert.equal(nuevo.json.usuario.debeCambiarContrasena, false);
  });

  test('la nueva, con las mismas reglas que el alta', async () => {
    const casos = [
      [undefined, 'La contraseña nueva es obligatoria'],
      ['', 'La contraseña nueva es obligatoria'],
      ['        ', 'La contraseña no puede tener solo espacios'],
      ['corta', 'La contraseña debe tener al menos 8 caracteres'],
      [CLAVE, 'Tiene que ser distinta de la actual'],
    ];
    for (const [nueva, mensaje] of casos) {
      const { status, json } = await cambiar(RAMIRO, CLAVE, nueva);
      assert.equal(status, 400, String(nueva));
      assert.deepEqual(json.errores, { contrasenaNueva: mensaje });
    }
    assert.equal(cuenta(RAMIRO).contrasenaHash, HASH_CLAVE);
  });

  test('sin la actual: los dos errores juntos', async () => {
    const { json } = await cambiar(RAMIRO, '', 'corta');
    assert.deepEqual(json.errores, {
      contrasenaActual: 'Ingresá tu contraseña actual',
      contrasenaNueva: 'La contraseña debe tener al menos 8 caracteres',
    });
  });

  test('todos los perfiles pueden, también sin la provisoria', async () => {
    // Hugo (Personal de Taller) no tiene cuenta en los datos: se le crea una.
    db.usuarios.push({ ...cuenta(DIEGO), id: 7, personaId: 7, nombreUsuario: 'hpaz' });
    for (const id of [ADRIANA, DIEGO, 7, RAMIRO]) {
      assert.equal((await cambiar(id, CLAVE, `clave-nueva-${id}`)).status, 200, `cuenta ${id}`);
    }
  });

  test('un Encargado se cambia la suya (la de Usuarios se la cambia solo un Administrador, H4)', async () => {
    const usuarios = await pedir('PUT', `/usuarios/${DIEGO}`, { usuarioId: DIEGO, body: { nombreUsuario: 'dsosa', contrasena: 'nueva-clave-1' } });
    assert.equal(usuarios.status, 403);
    assert.equal((await cambiar(DIEGO, CLAVE, 'nueva-clave-1')).status, 200);
  });

  test('5 intentos con la actual incorrecta: el 6.º da 429 aunque sea la correcta', async () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await cambiar(RAMIRO, `incorrecta-${i}`, 'clave-nueva-1')).status, 400);
    }
    const { status, json } = await cambiar(RAMIRO, CLAVE, 'clave-nueva-1');
    assert.equal(status, 429);
    assert.equal(json.error, 'Demasiados intentos. Probá de nuevo en unos minutos.');
    assert.equal(cuenta(RAMIRO).contrasenaHash, HASH_CLAVE);
    // Los errores de formato de la nueva no cuentan como intentos.
    limiteCambioContrasena.reiniciar();
    for (let i = 0; i < 6; i += 1) await cambiar(DIEGO, CLAVE, 'corta');
    assert.equal((await cambiar(DIEGO, CLAVE, 'clave-nueva-1')).status, 200);
  });

  test('sin sesión: 401', async () => {
    const { status } = await pedir('PUT', '/auth/contrasena', { token: null, body: { contrasenaActual: CLAVE, contrasenaNueva: 'x'.repeat(10) } });
    assert.equal(status, 401);
  });
});

// Todas las rutas declaradas en src/routes, con el prefijo con el que las monta
// app.js. Se leen los archivos (no los internos de Express), así una ruta nueva
// entra sola en el test.
function rutasDeLaApp() {
  const appJs = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const archivoDe = Object.fromEntries(
    [...appJs.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)].map(([, variable, archivo]) => [variable, archivo])
  );
  const rutas = [];
  for (const [, prefijo, variable] of appJs.matchAll(/app\.use\('([^']+)', (\w+)\)/g)) {
    const fuente = fs.readFileSync(path.join(SRC, 'routes', `${archivoDe[variable]}.js`), 'utf8');
    for (const [, metodo, ruta] of fuente.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      rutas.push({ metodo: metodo.toUpperCase(), ruta: `${prefijo}${ruta === '/' ? '' : ruta}` });
    }
  }
  return rutas;
}
