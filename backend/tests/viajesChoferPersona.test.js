// Tests de la autorización del chofer de un viaje después de separar personas y
// usuarios: Viaje.choferId es id de PERSONA (chofer_persona_id) y se compara
// SOLO contra el personaId del token, nunca contra el id de usuario.
//
// El escenario que reproduce el bug: personas y usuarios son tablas con
// secuencias distintas. Para los datos migrados los ids coinciden (el backfill
// los copió), pero se desfasan apenas se da de alta una persona sin cuenta y
// después otra con cuenta:
//
//   - persona 11, Eva: chofer sin cuenta de usuario;
//   - persona 12, Fede: chofer con cuenta → usuario 11.
//
// El usuario 11 (Fede) tiene el mismo número que la persona de Eva: si la
// comparación cae al id de usuario, Fede puede comenzar y finalizar los viajes
// de Eva.
//
// Levantan la app real de Express con un JWT real y el doble de Prisma con
// estado: NO tocan la base ni leen el .env. Se corren con `npm test`.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache, ESTADOS } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar, agregarViaje } = crearEntorno();

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
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

const PERSONA_EVA = 11;
const PERSONA_FEDE = 12;
const USUARIO_FEDE = 11;

function persona(id, nombre) {
  return {
    id,
    nombre,
    apellido: 'Nueva',
    dni: `3022200${id}`,
    email: `${nombre.toLowerCase()}@adrimar.com`,
    telefono: null,
    perfilId: 4,
    perfil: { id: 4, descripcion: 'CHOFER', nombre: 'CHOFER' },
    habilitadoParaConducir: true,
    activo: true,
    fechaBaja: null,
    creadoEn: new Date('2026-10-22T00:00:00Z'),
    actualizadoEn: new Date('2026-10-22T00:00:00Z'),
  };
}

beforeEach(() => {
  sembrar();
  const eva = persona(PERSONA_EVA, 'Eva');
  const fede = persona(PERSONA_FEDE, 'Fede');
  db.personas.push(eva, fede);
  db.usuarios.push({
    id: USUARIO_FEDE,
    personaId: PERSONA_FEDE,
    nombreUsuario: 'fede',
    nombre: 'Fede',
    apellido: 'Nueva',
    telefono: null,
    habilitadoParaConducir: true,
    estadoUsuario: { id: 1, descripcion: 'ACTIVO' },
    persona: fede,
  });
});

const FEDE = { id: USUARIO_FEDE, personaId: PERSONA_FEDE, nombreUsuario: 'fede', perfil: 'CHOFER', habilitadoParaConducir: true };
const UN_GESTOR = { id: 10, personaId: 10, nombreUsuario: 'admin', perfil: 'ADMINISTRADOR', habilitadoParaConducir: false };

async function pedir(metodo, ruta, { token, body } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: respuesta.status, json: await respuesta.json(), renovado: respuesta.headers.get('x-renewed-token') };
}

// El odómetro solo sube: cada comienzo y cada fin cargan un valor mayor que el
// anterior, para que ningún test choque con la validación de lecturas.
let odometro = 1000;
const comenzar = (viaje, usuario) =>
  pedir('PATCH', `/viajes/${viaje.id}/comenzar`, { token: generarToken(usuario), body: { odometroInicial: (odometro += 100) } });
const finalizar = (viaje, usuario) =>
  pedir('PATCH', `/viajes/${viaje.id}/finalizar`, { token: generarToken(usuario), body: { odometroFinal: (odometro += 100) } });

const viajeDe = (choferId, estado = 'PROGRAMADO') => agregarViaje({ estado, choferId, vehiculoId: 7 });
const estadoDe = (viaje) => Object.keys(ESTADOS).find((k) => ESTADOS[k] === db.viajes.find((v) => v.id === viaje.id).estadoViajeId);

describe('persona.id distinto de usuario.id: el chofer del viaje se compara con personaId', () => {
  test('el dueño del viaje (usuario 11, persona 12) puede comenzarlo y finalizarlo', async () => {
    const viaje = viajeDe(PERSONA_FEDE);

    const comienzo = await comenzar(viaje, FEDE);
    assert.equal(comienzo.status, 200, JSON.stringify(comienzo.json));
    assert.equal(estadoDe(viaje), 'EN_VIAJE');

    const fin = await finalizar(viaje, FEDE);
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    assert.equal(estadoDe(viaje), 'FINALIZADO');
  });

  test('el usuario 11 NO puede comenzar el viaje de la persona 11 (otra chofer): 403', async () => {
    const viaje = viajeDe(PERSONA_EVA);

    const { status, json } = await comenzar(viaje, FEDE);
    assert.equal(status, 403);
    assert.equal(json.error, 'No tiene permisos para comenzar este viaje');
    assert.equal(estadoDe(viaje), 'PROGRAMADO', 'el viaje no se tocó');
  });

  test('el usuario 11 NO puede finalizar el viaje en curso de la persona 11: 403', async () => {
    const viaje = viajeDe(PERSONA_EVA, 'EN_VIAJE');

    const { status, json } = await finalizar(viaje, FEDE);
    assert.equal(status, 403);
    assert.equal(json.error, 'No tiene permisos para finalizar este viaje');
    assert.equal(estadoDe(viaje), 'EN_VIAJE', 'el viaje no se tocó');
  });

  test('en mis-viajes, el usuario 11 ve los viajes de su persona y no los de la persona 11', async () => {
    const propio = viajeDe(PERSONA_FEDE);
    viajeDe(PERSONA_EVA);

    const { status, json } = await pedir('GET', '/viajes/mis-viajes', { token: generarToken(FEDE) });
    assert.equal(status, 200);
    assert.deepEqual(json.viajes.map((v) => v.id), [propio.id]);
  });

  test('el mensaje del 409 por viaje en curso: "Ya tenés…" solo para el dueño', async () => {
    // Fede ya tiene un viaje en curso y quiere comenzar otro suyo.
    viajeDe(PERSONA_FEDE, 'EN_VIAJE');
    const otroDeFede = agregarViaje({ estado: 'PROGRAMADO', choferId: PERSONA_FEDE, vehiculoId: 9 });
    const propio = await comenzar(otroDeFede, FEDE);
    assert.equal(propio.status, 409);
    assert.equal(propio.json.error, 'Ya tenés un viaje en curso. Finalizalo para comenzar otro.');

    // Un gestor cuyo usuario.id coincide con la persona del chofer: el mensaje
    // habla del chofer, no de "tu" viaje.
    const gestorConIdDeFede = { ...UN_GESTOR, id: PERSONA_FEDE, personaId: 6 };
    const gestor = await comenzar(otroDeFede, gestorConIdDeFede);
    assert.equal(gestor.status, 409);
    assert.equal(gestor.json.error, 'Este chofer ya tiene un viaje en curso. Tiene que finalizarlo para comenzar otro.');
  });
});

describe('token sin personaId (emitido antes de la separación): 401', () => {
  // Un token viejo tiene la forma de antes: id, nombreUsuario, perfil y
  // habilitadoParaConducir, sin personaId.
  const tokenViejo = (usuario) => {
    const { personaId, ...resto } = usuario;
    return jwt.sign(resto, process.env.JWT_SECRET, { expiresIn: '60m' });
  };

  test('mis-viajes: 401 con el pedido de volver a iniciar sesión, sin renovar el token', async () => {
    // Con el token viejo, el usuario 11 caería al id de usuario y vería los
    // viajes de la persona 11.
    viajeDe(PERSONA_EVA);

    const { status, json, renovado } = await pedir('GET', '/viajes/mis-viajes', { token: tokenViejo(FEDE) });
    assert.equal(status, 401);
    assert.match(json.error, /iniciá sesión de nuevo/i);
    assert.equal(renovado, null, 'un token sin personaId no se renueva');
  });

  test('comenzar y finalizar: 401, y el viaje no se toca', async () => {
    const programado = viajeDe(PERSONA_EVA);
    const enCurso = viajeDe(PERSONA_EVA, 'EN_VIAJE');

    const comienzo = await pedir('PATCH', `/viajes/${programado.id}/comenzar`, {
      token: tokenViejo(FEDE),
      body: { odometroInicial: 1500 },
    });
    const fin = await pedir('PATCH', `/viajes/${enCurso.id}/finalizar`, {
      token: tokenViejo(FEDE),
      body: { odometroFinal: 1700 },
    });
    assert.equal(comienzo.status, 401);
    assert.equal(fin.status, 401);
    assert.equal(estadoDe(programado), 'PROGRAMADO');
    assert.equal(estadoDe(enCurso), 'EN_VIAJE');
  });

  test('también para los gestores, en cualquier ruta autenticada', async () => {
    const { status } = await pedir('GET', '/viajes', { token: tokenViejo(UN_GESTOR) });
    assert.equal(status, 401);
  });
});

describe('gestores: sin cambios', () => {
  test('un gestor comienza y finaliza el viaje de cualquier chofer', async () => {
    for (const choferId of [PERSONA_EVA, PERSONA_FEDE]) {
      const viaje = viajeDe(choferId);
      const comienzo = await comenzar(viaje, UN_GESTOR);
      assert.equal(comienzo.status, 200, JSON.stringify(comienzo.json));
      const fin = await finalizar(viaje, UN_GESTOR);
      assert.equal(fin.status, 200, JSON.stringify(fin.json));
      assert.equal(estadoDe(viaje), 'FINALIZADO');
    }
  });

  test('un ENCARGADO también', async () => {
    const viaje = viajeDe(PERSONA_EVA);
    const { status } = await comenzar(viaje, { ...UN_GESTOR, perfil: 'ENCARGADO' });
    assert.equal(status, 200);
  });

  test('un CHOFER que no es el dueño, con ids que no se cruzan: 403 como siempre', async () => {
    const viaje = viajeDe(PERSONA_EVA);
    const { status } = await comenzar(viaje, { id: 5, personaId: 5, nombreUsuario: 'ana5', perfil: 'CHOFER', habilitadoParaConducir: true });
    assert.equal(status, 403);
  });
});
