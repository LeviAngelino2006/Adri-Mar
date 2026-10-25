// Tests del módulo de Personas (CRUD, email opcional, unicidad DNI/email,
// habilitación para conducir y desactivación en cascada de usuario).
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
let siguientePersonaId = 1;
let siguienteUsuarioId = 1;

function chequearUnicosPersona(fila, ignorarId) {
  for (const p of personas) {
    if (p.id === ignorarId) continue;
    if (fila.dni && p.dni === fila.dni) {
      const err = new Error('Unique constraint failed on dni');
      err.code = 'P2002';
      err.meta = { target: ['dni'] };
      throw err;
    }
    if (fila.email && p.email && p.email.toLowerCase() === fila.email.toLowerCase()) {
      const err = new Error('Unique constraint failed on email');
      err.code = 'P2002';
      err.meta = { target: ['email'] };
      throw err;
    }
  }
}

const prismaFalso = {
  perfil: {
    findUnique: async ({ where }) =>
      PERFILES.find((p) => (where.id && p.id === where.id) || (where.descripcion && p.descripcion === where.descripcion)) ?? null,
    findMany: async () => PERFILES,
  },
  estadoUsuario: {
    findUnique: async ({ where: { descripcion } }) => ESTADOS_USUARIO.find((e) => e.descripcion === descripcion) ?? null,
  },
  persona: {
    findUnique: async ({ where, include }) => {
      const p = personas.find(
        (x) =>
          (where.id !== undefined && x.id === where.id) ||
          (where.dni && x.dni === where.dni) ||
          (where.email && x.email === where.email)
      );
      if (!p) return null;
      const res = { ...p };
      if (include?.perfil) res.perfil = PERFILES.find((perf) => perf.id === p.perfilId);
      if (include?.usuario) res.usuario = usuarios.find((u) => u.personaId === p.id) ?? null;
      return res;
    },
    findFirst: async ({ where }) => {
      const p = personas.find(
        (x) =>
          (where.id !== undefined && x.id === where.id) ||
          (where.dni && x.dni === where.dni) ||
          (where.email && x.email === where.email)
      );
      return p ? { ...p, perfil: PERFILES.find((perf) => perf.id === p.perfilId) } : null;
    },
    findMany: async ({ where = {}, include } = {}) => {
      let filas = [...personas];
      if (where.activo !== undefined) filas = filas.filter((p) => p.activo === where.activo);
      if (where.habilitadoParaConducir !== undefined) {
        filas = filas.filter((p) => p.habilitadoParaConducir === where.habilitadoParaConducir);
      }
      return filas.map((p) => ({
        ...p,
        perfil: PERFILES.find((perf) => perf.id === p.perfilId),
        usuario: usuarios.find((u) => u.personaId === p.id) ?? null,
      }));
    },
    count: async ({ where = {} } = {}) => {
      let filas = [...personas];
      if (where.activo !== undefined) filas = filas.filter((p) => p.activo === where.activo);
      return filas.length;
    },
    create: async ({ data, include }) => {
      chequearUnicosPersona(data);
      const fila = {
        id: siguientePersonaId++,
        activo: true,
        fechaBaja: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        ...data,
      };
      personas.push(fila);
      const res = { ...fila };
      if (include?.perfil) res.perfil = PERFILES.find((perf) => perf.id === fila.perfilId);
      return res;
    },
    update: async ({ where: { id }, data, include }) => {
      const p = personas.find((x) => x.id === id);
      if (!p) throw new Error('Record not found');
      chequearUnicosPersona({ ...p, ...data }, id);
      Object.assign(p, data);
      const res = { ...p };
      if (include?.perfil) res.perfil = PERFILES.find((perf) => perf.id === p.perfilId);
      if (include?.usuario) res.usuario = usuarios.find((u) => u.personaId === p.id) ?? null;
      return res;
    },
  },
  usuario: {
    findFirst: async ({ where }) => usuarios.find((u) => where.personaId && u.personaId === where.personaId) ?? null,
    findUnique: async ({ where }) => usuarios.find((u) => where.id && u.id === where.id) ?? null,
    update: async ({ where: { id }, data }) => {
      const u = usuarios.find((x) => x.id === id);
      if (u) Object.assign(u, data);
      return u;
    },
    updateMany: async ({ where, data }) => {
      const af = usuarios.filter((u) => where.personaId && u.personaId === where.personaId);
      af.forEach((u) => Object.assign(u, data));
      return { count: af.length };
    },
  },
  // Sin viajes: ni En viaje ni Programados, y ninguna candidatura que quitar.
  viaje: { findFirst: async () => null, findMany: async () => [] },
  viajeChoferCandidato: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (fn) => fn(prismaFalso),
};

instalarEnCache(SRC, prismaFalso);

// La sesión sale del token (ver helpers/sesionDelToken.js).
const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
instalarSesionDelToken(SRC);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/personas`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  personas.length = 0;
  usuarios.length = 0;
  siguientePersonaId = 1;
  siguienteUsuarioId = 1;
});

const token = generarToken({ id: 999, personaId: 999, nombreUsuario: 'admin-test', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false });

async function enviar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: respuesta.status, json: await respuesta.json() };
}

const datosPersona = (sobrescribir = {}) => ({
  nombre: 'Ana',
  apellido: 'Pérez',
  dni: '30111222',
  email: '',
  telefono: '',
  perfil: 'CHOFER',
  habilitadoParaConducir: true,
  ...sobrescribir,
});

describe('Módulo de Personas - Alta y Email Opcional', () => {
  test('crear persona sin email guarda email como null', async () => {
    const { status, json } = await enviar('POST', '', datosPersona());
    assert.equal(status, 201);
    assert.equal(json.persona.email, null);
    assert.equal(personas[0].email, null);
    assert.equal(json.persona.habilitadoParaConducir, true);
  });

  test('email de solo espacios se normaliza a null', async () => {
    const { status, json } = await enviar('POST', '', datosPersona({ email: '   ' }));
    assert.equal(status, 201);
    assert.equal(json.persona.email, null);
  });

  test('email con formato inválido devuelve 400', async () => {
    const { status, json } = await enviar('POST', '', datosPersona({ email: 'invalido@sin-dominio' }));
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { email: 'El email no tiene un formato válido' });
  });

  test('dos personas sin email no chocan', async () => {
    const r1 = await enviar('POST', '', datosPersona({ dni: '11111111' }));
    const r2 = await enviar('POST', '', datosPersona({ dni: '22222222' }));
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(personas.length, 2);
  });

  test('dos personas con el mismo email chocan (400)', async () => {
    await enviar('POST', '', datosPersona({ email: 'chofer@empresa.com' }));
    const { status, json } = await enviar('POST', '', datosPersona({ dni: '99999999', email: 'CHOFER@empresa.com' }));
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { email: 'Ese email ya está registrado' });
  });

  test('dos personas con el mismo DNI chocan (400)', async () => {
    await enviar('POST', '', datosPersona({ dni: '30111222' }));
    const { status, json } = await enviar('POST', '', datosPersona({ dni: '30111222' }));
    assert.equal(status, 400);
    assert.deepEqual(json.errores, { dni: 'Ese DNI ya está registrado' });
  });
});

describe('Módulo de Personas - Edición y Baja con Desactivación de Usuario', () => {
  test('editar persona y limpiar email lo deja en null', async () => {
    const { json: creada } = await enviar('POST', '', datosPersona({ email: 'test@empresa.com' }));
    const { status, json } = await enviar('PUT', `/${creada.persona.id}`, datosPersona({ email: '' }));
    assert.equal(status, 200);
    assert.equal(json.persona.email, null);
  });

  test('dar de baja a persona desactiva su usuario asociado', async () => {
    const { json: creada } = await enviar('POST', '', datosPersona());
    const personaId = creada.persona.id;

    // Asignamos un usuario simulado
    const u = {
      id: siguienteUsuarioId++,
      personaId,
      nombreUsuario: 'aperez',
      estadoUsuarioId: 1,
    };
    usuarios.push(u);

    const { status, json } = await enviar('PATCH', `/${personaId}/baja`);
    assert.equal(status, 200);
    assert.equal(json.persona.activo, false);
    assert.equal(personas[0].activo, false);
    // El usuario vinculado debe haber pasado a INACTIVO (estadoUsuarioId: 2)
    assert.equal(usuarios[0].estadoUsuarioId, 2);
  });
});
