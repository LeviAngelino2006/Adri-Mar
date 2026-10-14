// Tests del email opcional en el alta y la edición de usuarios.
//
// Levantan la app real de Express con un JWT real y con Prisma reemplazado por
// un doble en memoria que respeta los @unique de `usuarios` como Postgres: dos
// strings iguales chocan (P2002), dos NULL no. NO tocan la base ni el .env. Se
// corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER', 'CHOFER'].map((descripcion, i) => ({
  id: i + 1,
  descripcion,
}));
const ESTADOS_USUARIO = [
  { id: 1, descripcion: 'ACTIVO' },
  { id: 2, descripcion: 'INACTIVO' },
];
const UNICOS = [
  ['nombreUsuario', 'nombre_usuario'],
  ['dni', 'dni'],
  ['email', 'email'],
];

const usuarios = [];
let siguienteId = 1;

const conRelaciones = (u) => ({
  ...u,
  perfil: PERFILES.find((p) => p.id === u.perfilId),
  estadoUsuario: ESTADOS_USUARIO.find((e) => e.id === u.estadoUsuarioId),
});

function chequearUnicos(fila, ignorarId) {
  for (const [campo, columna] of UNICOS) {
    if (fila[campo] === null || fila[campo] === undefined) continue;
    if (usuarios.some((u) => u.id !== ignorarId && u[campo] === fila[campo])) {
      const error = new Error(`Unique constraint failed on ${columna}`);
      error.code = 'P2002';
      error.meta = { target: [columna] };
      throw error;
    }
  }
}

const prismaFalso = {
  perfil: { findUnique: async ({ where: { descripcion } }) => PERFILES.find((p) => p.descripcion === descripcion) ?? null },
  estadoUsuario: {
    findUnique: async ({ where: { descripcion } }) => ESTADOS_USUARIO.find((e) => e.descripcion === descripcion) ?? null,
  },
  viaje: { findFirst: async () => null },
  usuario: {
    findUnique: async ({ where }) => {
      const [[campo, valor]] = Object.entries(where);
      const fila = usuarios.find((u) => u[campo] === valor);
      return fila ? conRelaciones(fila) : null;
    },
    create: async ({ data }) => {
      chequearUnicos(data);
      const fila = { id: siguienteId++, ...data };
      usuarios.push(fila);
      return conRelaciones(fila);
    },
    update: async ({ where: { id }, data }) => {
      const fila = usuarios.find((u) => u.id === id);
      const cambios = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      chequearUnicos({ ...fila, ...cambios }, id);
      Object.assign(fila, cambios);
      return conRelaciones(fila);
    },
  },
};

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/usuarios`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  usuarios.length = 0;
  siguienteId = 1;
});

const token = generarToken({ id: 999, nombreUsuario: 'admin-test', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false });

async function enviar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

// Lo que manda el formulario del front: email '' cuando el campo queda vacío.
const datosUsuario = (sobrescribir = {}) => ({
  nombre: 'Ana',
  apellido: 'Pérez',
  nombreUsuario: 'aperez',
  contrasena: 'clave-segura',
  perfil: 'CHOFER',
  dni: '30111222',
  email: '',
  telefono: '',
  ...sobrescribir,
});

describe('Email opcional en el alta de usuarios', () => {
  test('sin email se crea igual y se guarda null', async () => {
    const { status, json } = await enviar('POST', '', datosUsuario());
    assert.equal(status, 201);
    assert.equal(json.usuario.email, null);
    assert.equal(usuarios[0].email, null);
  });

  test('un email de solo espacios se guarda null', async () => {
    const { status } = await enviar('POST', '', datosUsuario({ email: '   ' }));
    assert.equal(status, 201);
    assert.equal(usuarios[0].email, null);
  });

  test('si no viene el campo también se crea con null', async () => {
    const { email, ...sinEmail } = datosUsuario();
    const { status } = await enviar('POST', '', sinEmail);
    assert.equal(status, 201);
    assert.equal(usuarios[0].email, null);
  });

  test('un email con formato inválido da el error de formato', async () => {
    const { status, json } = await enviar('POST', '', datosUsuario({ email: 'ana@sin-dominio' }));
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { email: 'El email no tiene un formato válido' });
    assert.equal(usuarios.length, 0);
  });

  test('un email válido se guarda normalizado', async () => {
    const { status, json } = await enviar('POST', '', datosUsuario({ email: '  Ana@Mail.com ' }));
    assert.equal(status, 201);
    assert.equal(json.usuario.email, 'ana@mail.com');
  });

  test('dos usuarios sin email no chocan con el @unique', async () => {
    const primero = await enviar('POST', '', datosUsuario());
    const segundo = await enviar('POST', '', datosUsuario({ nombreUsuario: 'bgomez', dni: '30111333' }));
    assert.equal(primero.status, 201);
    assert.equal(segundo.status, 201);
    assert.deepEqual(usuarios.map((u) => u.email), [null, null]);
  });

  test('dos usuarios con el mismo email siguen chocando', async () => {
    await enviar('POST', '', datosUsuario({ email: 'ana@mail.com' }));
    const { status, json } = await enviar(
      'POST',
      '',
      datosUsuario({ nombreUsuario: 'bgomez', dni: '30111333', email: 'ana@mail.com' })
    );
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { email: 'Ese email ya está registrado' });
  });
});

describe('Email opcional en la edición de usuarios', () => {
  test('borrar el email de un usuario que tenía uno lo deja en null', async () => {
    const alta = await enviar('POST', '', datosUsuario({ email: 'ana@mail.com' }));
    const { contrasena, ...edicion } = datosUsuario({ email: '' });

    const { status, json } = await enviar('PUT', `/${alta.json.usuario.id}`, edicion);
    assert.equal(status, 200);
    assert.equal(json.usuario.email, null);
    assert.equal(usuarios[0].email, null);
  });

  test('editar con un email inválido da el error de formato y no cambia nada', async () => {
    const alta = await enviar('POST', '', datosUsuario({ email: 'ana@mail.com' }));
    const { contrasena, ...edicion } = datosUsuario({ email: 'no-es-email' });

    const { status, json } = await enviar('PUT', `/${alta.json.usuario.id}`, edicion);
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { email: 'El email no tiene un formato válido' });
    assert.equal(usuarios[0].email, 'ana@mail.com');
  });

  test('dejar sin email a dos usuarios editados no choca', async () => {
    const a = await enviar('POST', '', datosUsuario({ email: 'ana@mail.com' }));
    const b = await enviar('POST', '', datosUsuario({ nombreUsuario: 'bgomez', dni: '30111333', email: 'beto@mail.com' }));
    const { contrasena, ...edicionA } = datosUsuario();
    const { contrasena: _, ...edicionB } = datosUsuario({ nombreUsuario: 'bgomez', dni: '30111333' });

    assert.equal((await enviar('PUT', `/${a.json.usuario.id}`, edicionA)).status, 200);
    assert.equal((await enviar('PUT', `/${b.json.usuario.id}`, edicionB)).status, 200);
    assert.deepEqual(usuarios.map((u) => u.email), [null, null]);
  });
});
