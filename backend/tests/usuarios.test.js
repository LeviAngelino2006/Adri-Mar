// Tests del módulo de Usuarios (asociación con Persona, credenciales, unicidad).
//
// Levantan la app real de Express con un JWT real y Prisma en memoria:
// NO tocan la base de datos ni leen el .env. Se corren con `npm test` (node:test).

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const PERFILES = [
  { id: 1, descripcion: 'ADMINISTRADOR', nombre: 'ADMINISTRADOR' },
  { id: 2, descripcion: 'ENCARGADO', nombre: 'ENCARGADO' },
  { id: 3, descripcion: 'PERSONAL_TALLER', nombre: 'PERSONAL_TALLER' },
  { id: 4, descripcion: 'CHOFER', nombre: 'CHOFER' },
];

const ESTADOS_USUARIO = [
  { id: 1, descripcion: 'ACTIVO' },
  { id: 2, descripcion: 'INACTIVO' },
];

const personas = [];
const usuarios = [];
let siguienteUsuarioId = 1;

function conRelaciones(u) {
  const p = personas.find((pers) => pers.id === u.personaId);
  return {
    ...u,
    persona: p ? { ...p, perfil: PERFILES.find((perf) => perf.id === p.perfilId) } : null,
    estadoUsuario: ESTADOS_USUARIO.find((e) => e.id === u.estadoUsuarioId),
  };
}

function chequearUnicosUsuario(fila, ignorarId) {
  for (const u of usuarios) {
    if (u.id === ignorarId) continue;
    if (fila.nombreUsuario && u.nombreUsuario === fila.nombreUsuario) {
      const err = new Error('Unique constraint failed on nombre_usuario');
      err.code = 'P2002';
      err.meta = { target: ['nombre_usuario'] };
      throw err;
    }
    if (fila.personaId && u.personaId === fila.personaId) {
      const err = new Error('Unique constraint failed on persona_id');
      err.code = 'P2002';
      err.meta = { target: ['persona_id'] };
      throw err;
    }
  }
}

const prismaFalso = {
  perfil: {
    findUnique: async ({ where: { descripcion } }) => PERFILES.find((p) => p.descripcion === descripcion) ?? null,
  },
  estadoUsuario: {
    findUnique: async ({ where: { descripcion } }) => ESTADOS_USUARIO.find((e) => e.descripcion === descripcion) ?? null,
  },
  persona: {
    findUnique: async ({ where, include }) => {
      const p = personas.find((x) => x.id === where.id);
      if (!p) return null;
      const res = { ...p };
      if (include?.perfil) res.perfil = PERFILES.find((perf) => perf.id === p.perfilId);
      if (include?.usuario) res.usuario = usuarios.find((u) => u.personaId === p.id) ?? null;
      return res;
    },
  },
  usuario: {
    findUnique: async ({ where }) => {
      const fila = usuarios.find(
        (u) =>
          (where.id !== undefined && u.id === where.id) ||
          (where.nombreUsuario && u.nombreUsuario === where.nombreUsuario) ||
          (where.personaId && u.personaId === where.personaId)
      );
      return fila ? conRelaciones(fila) : null;
    },
    findFirst: async ({ where }) => {
      const fila = usuarios.find(
        (u) =>
          (where.id !== undefined && u.id === where.id) ||
          (where.nombreUsuario && u.nombreUsuario === where.nombreUsuario) ||
          (where.personaId && u.personaId === where.personaId)
      );
      return fila ? conRelaciones(fila) : null;
    },
    findMany: async () => usuarios.map(conRelaciones),
    create: async ({ data }) => {
      chequearUnicosUsuario(data);
      const fila = { id: siguienteUsuarioId++, creadoEn: new Date(), ...data };
      usuarios.push(fila);
      return conRelaciones(fila);
    },
    update: async ({ where: { id }, data }) => {
      const fila = usuarios.find((u) => u.id === id);
      if (!fila) throw new Error('Record not found');
      const cambios = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      chequearUnicosUsuario({ ...fila, ...cambios }, id);
      Object.assign(fila, cambios);
      return conRelaciones(fila);
    },
  },
  viaje: { findFirst: async () => null },
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
  personas.length = 0;
  usuarios.length = 0;
  siguienteUsuarioId = 1;

  // Sembrar personas de prueba
  personas.push(
    { id: 1, nombre: 'Ana', apellido: 'Pérez', dni: '30111222', email: 'ana@adrimar.com', perfilId: 4, habilitadoParaConducir: true, activo: true },
    { id: 2, nombre: 'Beto', apellido: 'Gómez', dni: '30111333', email: null, perfilId: 4, habilitadoParaConducir: true, activo: true },
    { id: 3, nombre: 'Carlos', apellido: 'Inactivo', dni: '30111444', email: null, perfilId: 4, habilitadoParaConducir: false, activo: false }
  );
});

const token = generarToken({ id: 999, nombreUsuario: 'admin-test', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false });

async function enviar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

describe('Módulo de Usuarios - Creación y Asociación con Persona', () => {
  test('crear usuario vinculando a una persona válida', async () => {
    const { status, json } = await enviar('POST', '', {
      personaId: 1,
      nombreUsuario: 'aperez',
      contrasena: 'clave-segura-123',
    });
    assert.equal(status, 201);
    assert.equal(json.usuario.nombreUsuario, 'aperez');
    assert.equal(json.usuario.personaId, 1);
    assert.equal(json.usuario.nombre, 'Ana');
    assert.equal(json.usuario.perfil, 'CHOFER');
    assert.equal(usuarios.length, 1);
  });

  test('no se puede crear usuario sin personaId', async () => {
    const { status, json } = await enviar('POST', '', {
      nombreUsuario: 'sinpersona',
      contrasena: 'clave-segura-123',
    });
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { personaId: 'Debe seleccionar una persona válida' });
  });

  test('no se puede crear usuario para una persona dada de baja', async () => {
    const { status, json } = await enviar('POST', '', {
      personaId: 3,
      nombreUsuario: 'inactivo',
      contrasena: 'clave-segura-123',
    });
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { personaId: 'No se puede crear una cuenta para una persona dada de baja' });
  });

  test('no se puede crear dos usuarios para la misma persona', async () => {
    await enviar('POST', '', { personaId: 1, nombreUsuario: 'aperez', contrasena: 'clave-segura-123' });
    const { status, json } = await enviar('POST', '', { personaId: 1, nombreUsuario: 'aperez2', contrasena: 'clave-segura-123' });
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { personaId: 'Esta persona ya tiene una cuenta de usuario asignada' });
  });

  test('nombre de usuario duplicado es rechazado', async () => {
    await enviar('POST', '', { personaId: 1, nombreUsuario: 'usuario1', contrasena: 'clave-segura-123' });
    const { status, json } = await enviar('POST', '', { personaId: 2, nombreUsuario: 'usuario1', contrasena: 'clave-segura-123' });
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { nombreUsuario: 'Ese nombre de usuario ya existe' });
  });
});

describe('Módulo de Usuarios - Edición y Baja', () => {
  test('modificar nombre de usuario', async () => {
    const alta = await enviar('POST', '', { personaId: 1, nombreUsuario: 'aperez', contrasena: 'clave-segura-123' });
    const { status, json } = await enviar('PUT', `/${alta.json.usuario.id}`, { nombreUsuario: 'anaperez' });
    assert.equal(status, 200);
    assert.equal(json.usuario.nombreUsuario, 'anaperez');
  });

  test('dar de baja cuenta de usuario deja a la Persona activa', async () => {
    const alta = await enviar('POST', '', { personaId: 1, nombreUsuario: 'aperez', contrasena: 'clave-segura-123' });
    const { status, json } = await enviar('PATCH', `/${alta.json.usuario.id}/baja`);
    assert.equal(status, 200);
    assert.equal(json.usuario.activo, false);
    // La persona física sigue activa en la empresa
    assert.equal(personas.find((p) => p.id === 1).activo, true);
  });
});
