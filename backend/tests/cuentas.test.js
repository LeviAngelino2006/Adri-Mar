// Tests de seguridad de Personal y Usuarios (tanda 1 de la auditoría,
// docs/auditoria-ux/personal-usuarios.md): el último Administrador (H2), las
// acciones sobre uno mismo (H3), las credenciales de un Encargado (H4), lo que un
// Encargado ve de un Administrador (H5), la cuenta de una persona dada de baja
// (H10) y las contraseñas vacías o con solo espacios (H12). Los escenarios salen
// de las pruebas contra la API de la auditoría (G1, G2, G3, G4 y G7). El límite
// de intentos de login está en login.test.js.
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

describe('H3: nadie actúa sobre sí mismo', () => {
  const ADRIANA = { id: 1, personaId: 1, perfil: 'ADMINISTRADOR' };
  const DIEGO = { id: 4, personaId: 4, perfil: 'ENCARGADO' };

  test('G2: la Administradora no se puede dar de baja a sí misma', async () => {
    const { status, json } = await pedir('PATCH', '/personas/1/baja', { como: ADRIANA });
    assert.equal(status, 409);
    assert.equal(json.error, 'No podés darte de baja a vos mismo');
    assert.equal(persona(1).activo, true);
  });

  test('G1: el Encargado no se puede cambiar el perfil a sí mismo', async () => {
    const { status, json } = await pedir('PUT', '/personas/4', { como: DIEGO, body: datosDe(4, { perfil: 'PERSONAL_TALLER' }) });
    assert.equal(status, 409);
    assert.equal(json.error, 'No podés cambiar tu propio perfil');
    assert.equal(perfilDe(4), 'ENCARGADO');
  });

  test('tampoco la habilitación para conducir', async () => {
    const { status, json } = await pedir('PUT', '/personas/1', { como: ADRIANA, body: datosDe(1, { habilitadoParaConducir: true }) });
    assert.equal(status, 409);
    assert.equal(json.error, 'No podés cambiar tu propio perfil');
    assert.equal(persona(1).habilitadoParaConducir, false);
  });

  test('sus propios datos sí: el formulario completo con el mismo perfil y habilitación', async () => {
    const { status, json } = await pedir('PUT', '/personas/4', { como: DIEGO, body: datosDe(4, { telefono: '3571 41-0004' }) });
    assert.equal(status, 200);
    assert.equal(json.persona.telefono, '3571 41-0004');
  });

  test('G1 y G3: nadie se bloquea la cuenta, ni por /baja ni por PUT activo=false', async () => {
    const encargado = await pedir('PATCH', '/usuarios/4/baja', { como: DIEGO });
    const admin = await pedir('PUT', '/usuarios/1', { como: ADRIANA, body: { nombreUsuario: 'amartinez', activo: false } });
    for (const { status, json } of [encargado, admin]) {
      assert.equal(status, 409);
      assert.equal(json.error, 'No podés bloquear tu propia cuenta');
    }
    assert.equal(estadoDe(4), 'ACTIVO');
    assert.equal(estadoDe(1), 'ACTIVO');
  });

  test('sobre otra persona sí: Carlos le cambia el perfil a Adriana', async () => {
    const CARLOS = { id: 2, personaId: 2, perfil: 'ADMINISTRADOR' };
    const { status } = await pedir('PUT', '/personas/1', { como: CARLOS, body: datosDe(1, { perfil: 'ENCARGADO' }) });
    assert.equal(status, 200);
  });

  test('se compara la persona, no el id de la cuenta: Ramiro (cuenta 11, persona 14)', async () => {
    const RAMIRO_GESTOR = { id: 11, personaId: 14, perfil: 'ENCARGADO' };
    const propia = await pedir('PATCH', '/usuarios/11/baja', { como: RAMIRO_GESTOR });
    assert.equal(propia.status, 409);
    // La cuenta 14 no existe; la persona 11 tampoco es él: no lo confunde.
    const ajena = await pedir('PATCH', '/personas/14/baja', { como: { id: 14, personaId: 11, perfil: 'ENCARGADO' } });
    assert.equal(ajena.status, 200);
  });
});

describe('H4: un Encargado no toma la cuenta de otro Encargado', () => {
  const DIEGO = { id: 4, personaId: 4, perfil: 'ENCARGADO' };
  const ADRIANA = { id: 1, personaId: 1, perfil: 'ADMINISTRADOR' };
  const CREDENCIALES_DE_ENCARGADO = 'Solo un Administrador puede cambiar el usuario o la contraseña de un Encargado.';

  test('G1: Diego no le puede cambiar la contraseña a Lucía', async () => {
    const { status, json } = await pedir('PUT', '/usuarios/3', { como: DIEGO, body: { nombreUsuario: 'lromero', contrasena: 'TomadaPorDiego1' } });
    assert.equal(status, 403);
    assert.equal(json.error, CREDENCIALES_DE_ENCARGADO);
    assert.equal(cuenta(3).contrasenaHash, 'hash-de-prueba');
  });

  test('G1: ni el nombre de usuario', async () => {
    const { status, json } = await pedir('PUT', '/usuarios/3', { como: DIEGO, body: { nombreUsuario: 'lucia.vieja' } });
    assert.equal(status, 403);
    assert.equal(json.error, CREDENCIALES_DE_ENCARGADO);
    assert.equal(cuenta(3).nombreUsuario, 'lromero');
  });

  test('tampoco los de su propia cuenta: los cambia un Administrador', async () => {
    const { status } = await pedir('PUT', '/usuarios/4', { como: DIEGO, body: { nombreUsuario: 'dsosa', contrasena: 'OtraClave123' } });
    assert.equal(status, 403);
  });

  test('un Administrador sí le cambia la contraseña a un Encargado', async () => {
    const { status } = await pedir('PUT', '/usuarios/3', { como: ADRIANA, body: { nombreUsuario: 'lromero', contrasena: 'NuevaClave123' } });
    assert.equal(status, 200);
    assert.notEqual(cuenta(3).contrasenaHash, 'hash-de-prueba');
  });

  test('un Encargado sigue gestionando las credenciales de un Chofer', async () => {
    const { status } = await pedir('PUT', '/usuarios/11', { como: DIEGO, body: { nombreUsuario: 'racosta', contrasena: 'NuevaClave123' } });
    assert.equal(status, 200);
  });

  test('lo demás queda como estaba: un Encargado puede bloquear la cuenta de otro (se decide en otra tanda)', async () => {
    const { status } = await pedir('PATCH', '/usuarios/3/baja', { como: DIEGO });
    assert.equal(status, 200);
    assert.equal(estadoDe(3), 'INACTIVO');
  });
});

describe('H5: lo que un Encargado ve de un Administrador', () => {
  const DIEGO = { id: 4, personaId: 4, perfil: 'ENCARGADO' };
  const ADRIANA = { id: 1, personaId: 1, perfil: 'ADMINISTRADOR' };

  test('G1: GET /usuarios/:id de un Administrador da 403 a un Encargado, igual que GET /personas/:id', async () => {
    const cuentaAdmin = await pedir('GET', '/usuarios/1', { como: DIEGO });
    const personaAdmin = await pedir('GET', '/personas/1', { como: DIEGO });
    assert.equal(cuentaAdmin.status, 403);
    assert.equal(cuentaAdmin.json.error, 'No tiene permisos para consultar este usuario');
    assert.equal(cuentaAdmin.json.usuario, undefined);
    assert.equal(personaAdmin.status, 403);
  });

  test('la cuenta de otro Encargado sí la ve, y un Administrador ve todas', async () => {
    assert.equal((await pedir('GET', '/usuarios/3', { como: DIEGO })).status, 200);
    assert.equal((await pedir('GET', '/usuarios/1', { como: ADRIANA })).status, 200);
  });

  test('los disponibles para conducir incluyen al Administrador que maneja, pero sin sus datos personales', async () => {
    persona(1).habilitadoParaConducir = true;
    for (const ruta of ['/personas/disponibles-chofer', '/usuarios/disponibles-chofer']) {
      const { status, json } = await pedir('GET', ruta, { como: DIEGO });
      assert.equal(status, 200);
      const lista = json.personas ?? json.usuarios;
      const adriana = lista.find((p) => p.id === 1);
      assert.deepEqual(adriana, { id: 1, nombre: 'Adriana', apellido: 'Martínez' }, ruta);
      for (const p of lista) assert.deepEqual(Object.keys(p).sort(), ['apellido', 'id', 'nombre'], ruta);
    }
  });
});

describe('H10: la cuenta de una persona dada de baja', () => {
  const REACTIVA_PRIMERO = 'Reactivá primero a la persona.';

  test('G4: no se activa la cuenta de Néstor (dado de baja)', async () => {
    const { status, json } = await pedir('PUT', '/usuarios/10', { body: { nombreUsuario: 'nvega', activo: true } });
    assert.equal(status, 409);
    assert.equal(json.error, REACTIVA_PRIMERO);
    assert.equal(estadoDe(10), 'INACTIVO');
  });

  test('G4: ni se le cambia la contraseña ni el nombre de usuario', async () => {
    const clave = await pedir('PUT', '/usuarios/10', { body: { nombreUsuario: 'nvega', contrasena: 'NuevaClave99' } });
    const nombre = await pedir('PUT', '/usuarios/10', { body: { nombreUsuario: 'nestor.vega' } });
    assert.equal(clave.status, 409);
    assert.equal(clave.json.error, REACTIVA_PRIMERO);
    assert.equal(nombre.status, 409);
    assert.equal(cuenta(10).contrasenaHash, 'hash-de-prueba');
    assert.equal(cuenta(10).nombreUsuario, 'nvega');
  });

  test('la cuenta bloqueada de una persona activa sí se puede volver a activar', async () => {
    cuenta(11).estadoUsuarioId = 2;
    const { status } = await pedir('PUT', '/usuarios/11', { body: { nombreUsuario: 'racosta', activo: true } });
    assert.equal(status, 200);
    assert.equal(estadoDe(11), 'ACTIVO');
  });
});

describe('G7: contraseñas vacías o con solo espacios', () => {
  test('en el alta: 8 espacios no son una contraseña', async () => {
    const { status, json } = await pedir('POST', '/usuarios', { body: { personaId: 7, nombreUsuario: 'hpaz', contrasena: '        ' } });
    assert.equal(status, 400);
    assert.equal(json.errores.contrasena, 'La contraseña no puede tener solo espacios');
    assert.equal(db.usuarios.some((u) => u.personaId === 7), false);
  });

  test('en el alta: vacía sigue siendo obligatoria', async () => {
    const { status, json } = await pedir('POST', '/usuarios', { body: { personaId: 7, nombreUsuario: 'hpaz', contrasena: '' } });
    assert.equal(status, 400);
    assert.equal(json.errores.contrasena, 'La contraseña es obligatoria');
  });

  test('al editar: solo espacios o vacía (mandada) dan error y no se cambia nada', async () => {
    const espacios = await pedir('PUT', '/usuarios/11', { body: { nombreUsuario: 'racosta', contrasena: '          ' } });
    const vacia = await pedir('PUT', '/usuarios/11', { body: { nombreUsuario: 'racosta', contrasena: '' } });
    assert.equal(espacios.status, 400);
    assert.equal(espacios.json.errores.contrasena, 'La contraseña no puede tener solo espacios');
    assert.equal(vacia.status, 400);
    assert.equal(vacia.json.errores.contrasena, 'La contraseña no puede estar vacía');
    assert.equal(cuenta(11).contrasenaHash, 'hash-de-prueba');
  });

  test('al editar sin mandar contraseña, no se cambia (y se guarda lo demás)', async () => {
    const { status } = await pedir('PUT', '/usuarios/11', { body: { nombreUsuario: 'ramiro.acosta' } });
    assert.equal(status, 200);
    assert.equal(cuenta(11).nombreUsuario, 'ramiro.acosta');
    assert.equal(cuenta(11).contrasenaHash, 'hash-de-prueba');
  });

  test('una contraseña con espacios adentro es válida', async () => {
    const { status } = await pedir('PUT', '/usuarios/11', { body: { nombreUsuario: 'racosta', contrasena: 'mi clave larga' } });
    assert.equal(status, 200);
    assert.notEqual(cuenta(11).contrasenaHash, 'hash-de-prueba');
  });
});
