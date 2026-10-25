// Tests de la sesión (H1 de docs/auditoria-ux/personal-usuarios.md): la sesión
// de cada pedido sale de la base, no del token. Un token firmado antes de que se
// bloquee la cuenta, se dé de baja a la persona o se le cambie el perfil o la
// habilitación ya no vale con los datos viejos.
//
// Reproducen los escenarios G1, G2, G3b y G6 de las pruebas contra la API de la
// auditoría. Usan el sesionService REAL con un doble de su consulta ($queryRaw):
// NO tocan la base ni leen el .env. La consulta SQL contra la base migrada la
// cubre el test de integración.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const PERFILES = { 1: 'ADMINISTRADOR', 2: 'ENCARGADO', 3: 'PERSONAL_TALLER', 4: 'CHOFER' };
const ID_PERFIL = Object.fromEntries(Object.entries(PERFILES).map(([id, d]) => [d, Number(id)]));

const personas = [];
const usuarios = [];
// Qué se le pidió a Prisma en cada pedido: la sesión tiene que ser UNA consulta.
const llamadas = [];
let sqlDeLaSesion = '';

const fila = (usuario) => {
  const p = personas.find((x) => x.id === usuario.personaId);
  return { usuario, persona: p };
};

const prismaFalso = {
  // La consulta de sesionService: un JOIN usuarios-estado-personas-perfiles por
  // id de usuario. El doble devuelve las mismas columnas con los mismos alias.
  $queryRaw: async (partes, usuarioId) => {
    llamadas.push('$queryRaw');
    sqlDeLaSesion = partes.join('?');
    const u = usuarios.find((x) => x.id === usuarioId);
    if (!u) return [];
    const { persona } = fila(u);
    return [
      {
        id: u.id,
        nombreUsuario: u.nombreUsuario,
        personaId: u.personaId,
        estadoCuenta: u.estado,
        personaActiva: persona.activo,
        habilitadoParaConducir: persona.habilitadoParaConducir,
        perfil: PERFILES[persona.perfilId],
      },
    ];
  },
  // /auth/me: el usuario con su persona y su perfil.
  usuario: {
    findUnique: async ({ where: { id } }) => {
      llamadas.push('usuario.findUnique');
      const u = usuarios.find((x) => x.id === id);
      if (!u) return null;
      const { persona } = fila(u);
      return { ...u, persona: { ...persona, perfil: { descripcion: PERFILES[persona.perfilId] } } };
    },
  },
};

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { generarToken, verificarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

// Mismos nombres que en los datos de la auditoría.
beforeEach(() => {
  llamadas.length = 0;
  personas.splice(0, personas.length,
    { id: 1, nombre: 'Adriana', apellido: 'Martínez', perfilId: 1, habilitadoParaConducir: false, activo: true },
    { id: 2, nombre: 'Carlos', apellido: 'Ferreyra', perfilId: 1, habilitadoParaConducir: false, activo: true },
    { id: 4, nombre: 'Diego', apellido: 'Sosa', perfilId: 2, habilitadoParaConducir: false, activo: true },
    { id: 14, nombre: 'Ramiro', apellido: 'Acosta', perfilId: 4, habilitadoParaConducir: true, activo: true },
    { id: 15, nombre: 'Federico', apellido: 'Luna', perfilId: 4, habilitadoParaConducir: true, activo: true }
  );
  usuarios.splice(0, usuarios.length,
    { id: 1, personaId: 1, nombreUsuario: 'amartinez', estado: 'ACTIVO' },
    { id: 2, personaId: 2, nombreUsuario: 'cferreyra', estado: 'ACTIVO' },
    { id: 4, personaId: 4, nombreUsuario: 'dsosa', estado: 'ACTIVO' },
    // El id de la cuenta NO coincide con el de la persona.
    { id: 11, personaId: 14, nombreUsuario: 'racosta', estado: 'ACTIVO' },
    { id: 12, personaId: 15, nombreUsuario: 'fluna', estado: 'ACTIVO' }
  );
});

// El token que emitió el login cuando la cuenta estaba activa y con su perfil
// de entonces.
function tokenDeLogin(usuarioId) {
  const u = usuarios.find((x) => x.id === usuarioId);
  const p = personas.find((x) => x.id === u.personaId);
  return generarToken({
    id: u.id,
    personaId: u.personaId,
    nombreUsuario: u.nombreUsuario,
    perfil: PERFILES[p.perfilId],
    habilitadoParaConducir: p.habilitadoParaConducir,
  });
}

async function pedir(metodo, ruta, { token, body } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await respuesta.text();
  return {
    status: respuesta.status,
    json: texto ? JSON.parse(texto) : null,
    renovado: respuesta.headers.get('x-renewed-token'),
  };
}

const persona = (id) => personas.find((p) => p.id === id);
const cuenta = (id) => usuarios.find((u) => u.id === id);
const SESION_NO_VALIDA = 'Tu sesión ya no es válida. Iniciá sesión de nuevo.';

describe('cuenta bloqueada o persona dada de baja: el token previo deja de valer (G2, G3b)', () => {
  test('cuenta bloqueada: 401 con el pedido de volver a iniciar sesión, y el token no se renueva', async () => {
    const token = tokenDeLogin(11);
    cuenta(11).estado = 'INACTIVO';

    const { status, json, renovado } = await pedir('GET', '/viajes/mis-viajes', { token });
    assert.equal(status, 401);
    assert.equal(json.error, SESION_NO_VALIDA);
    assert.equal(renovado, null);
  });

  test('cuenta bloqueada: el chofer ya no puede comenzar su viaje con el token previo (G3b)', async () => {
    const token = tokenDeLogin(11);
    cuenta(11).estado = 'INACTIVO';

    // Si el pedido pasara de autenticar, el doble no tiene viajes y daría 500.
    const { status } = await pedir('PATCH', '/viajes/7/comenzar', { token, body: { odometroInicial: 288200 } });
    assert.equal(status, 401);
  });

  test('persona dada de baja (cuenta todavía activa en la base): 401', async () => {
    const token = tokenDeLogin(1);
    persona(1).activo = false;

    const { status, json, renovado } = await pedir('POST', '/personas', {
      token,
      body: { nombre: 'Fantasma', apellido: 'Post Baja', dni: '42000111', perfil: 'ENCARGADO' },
    });
    assert.equal(status, 401);
    assert.equal(json.error, SESION_NO_VALIDA);
    assert.equal(renovado, null);
  });

  test('la cuenta ya no existe: 401', async () => {
    const token = tokenDeLogin(4);
    usuarios.splice(usuarios.findIndex((u) => u.id === 4), 1);

    const { status } = await pedir('GET', '/auth/me', { token });
    assert.equal(status, 401);
  });
});

describe('perfil y habilitación salen de la base (G1, G2, G6)', () => {
  test('un Encargado al que le bajaron el perfil a Taller ya no entra a Personal ni a Usuarios (G1)', async () => {
    const token = tokenDeLogin(4);
    persona(4).perfilId = ID_PERFIL.PERSONAL_TALLER;

    assert.equal((await pedir('GET', '/personas', { token })).status, 403);
    assert.equal((await pedir('GET', '/usuarios', { token })).status, 403);
  });

  test('un Administrador pasado a Chofer ya no puede crear un Administrador con su token previo (G2)', async () => {
    const token = tokenDeLogin(2);
    persona(2).perfilId = ID_PERFIL.CHOFER;

    const { status } = await pedir('POST', '/personas', {
      token,
      body: { nombre: 'Otro', apellido: 'Admin', dni: '42000222', perfil: 'ADMINISTRADOR' },
    });
    assert.equal(status, 403);
  });

  test('el token renovado lleva el perfil y la habilitación actuales, no los del token (G6)', async () => {
    const token = tokenDeLogin(12);
    persona(15).habilitadoParaConducir = false;
    persona(15).perfilId = ID_PERFIL.PERSONAL_TALLER;

    const { status, renovado } = await pedir('GET', '/auth/me', { token });
    assert.equal(status, 200);
    const payload = verificarToken(renovado);
    assert.equal(payload.perfil, 'PERSONAL_TALLER');
    assert.equal(payload.habilitadoParaConducir, false);
    assert.equal(payload.id, 12);
    assert.equal(payload.personaId, 15);
  });

  test('/auth/me devuelve el usuario de la base, con la forma del login', async () => {
    const token = tokenDeLogin(4);
    persona(4).perfilId = ID_PERFIL.CHOFER;
    persona(4).habilitadoParaConducir = true;

    const { status, json } = await pedir('GET', '/auth/me', { token });
    assert.equal(status, 200);
    assert.deepEqual(json.usuario, {
      id: 4,
      personaId: 4,
      nombre: 'Diego',
      apellido: 'Sosa',
      nombreUsuario: 'dsosa',
      perfil: 'CHOFER',
      habilitadoParaConducir: true,
    });
  });
});

describe('una sola consulta por pedido', () => {
  test('autenticar hace UNA consulta, por id de cuenta, y nada más', async () => {
    const token = tokenDeLogin(4);
    persona(4).perfilId = ID_PERFIL.CHOFER;

    // /personas con perfil Chofer: autorizar corta con 403 antes de cualquier
    // otra consulta, así que lo único que se ve es la de la sesión.
    const { status } = await pedir('GET', '/personas', { token });
    assert.equal(status, 403);
    assert.deepEqual(llamadas, ['$queryRaw']);
    assert.match(sqlDeLaSesion, /WHERE u\.id = \?/);
  });

  test('una cuenta activa sigue funcionando y el token se renueva', async () => {
    const token = tokenDeLogin(1);
    const { status, renovado } = await pedir('GET', '/auth/me', { token });
    assert.equal(status, 200);
    assert.ok(renovado);
    assert.equal(verificarToken(renovado).perfil, 'ADMINISTRADOR');
  });
});
