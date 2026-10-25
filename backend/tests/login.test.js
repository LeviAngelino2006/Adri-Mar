// Tests del login (H13 de docs/auditoria-ux/personal-usuarios.md, escenario G8
// de la auditoría: 30 intentos fallidos seguidos sin demora ni bloqueo).
//
// - El mensaje de credenciales incorrectas es el mismo exista o no la cuenta, y
//   siempre se compara una contraseña (mismo tiempo de respuesta).
// - Límite de intentos fallidos por nombre de usuario y por IP → 429.
// - La IP es la del cliente detrás de los dos proxies de Render (trust proxy 2):
//   un X-Forwarded-For inventado por el cliente no la cambia.
//
// Levantan la app real con Prisma en memoria: NO tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');
const express = require('express');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');

// Cuántas veces se comparó una contraseña: authService usa este mismo módulo.
let comparaciones = 0;
const compararOriginal = bcrypt.compare;
bcrypt.compare = (...args) => {
  comparaciones += 1;
  return compararOriginal(...args);
};

const CLAVE = 'Clave1234';
const HASH = bcrypt.hashSync(CLAVE, 4);
const cuentas = [
  { id: 1, nombreUsuario: 'amartinez', estado: 'ACTIVO', personaActiva: true },
  { id: 9, nombreUsuario: 'pmedina', estado: 'INACTIVO', personaActiva: true },
  { id: 10, nombreUsuario: 'nvega', estado: 'INACTIVO', personaActiva: false },
  // Cuenta activa de una persona dada de baja (el estado de H10).
  { id: 12, nombreUsuario: 'fantasma', estado: 'ACTIVO', personaActiva: false },
];

const prismaFalso = {
  usuario: {
    findUnique: async ({ where }) => {
      const c = cuentas.find((x) => x.nombreUsuario === where.nombreUsuario);
      if (!c) return null;
      return {
        id: c.id,
        personaId: c.id,
        nombreUsuario: c.nombreUsuario,
        contrasenaHash: HASH,
        estadoUsuario: { descripcion: c.estado },
        persona: { nombre: 'N', apellido: 'A', activo: c.personaActiva, habilitadoParaConducir: false, perfil: { descripcion: 'ADMINISTRADOR' } },
      };
    },
  },
};

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { limiteLogin, crearLimiteLogin, MAX_FALLOS_POR_USUARIO, MAX_FALLOS_POR_IP } = require(path.join(SRC, 'middlewares', 'limiteLogin.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/auth/login`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  limiteLogin.reiniciar();
  comparaciones = 0;
});

// Como llega en Render: X-Forwarded-For "<cliente>, <borde de Cloudflare>" y la
// conexión del balanceador (acá, 127.0.0.1). `previo` es lo que el cliente
// mandó por su cuenta en X-Forwarded-For (Cloudflare lo conserva adelante).
async function ingresar(nombreUsuario, contrasena, { ip = '200.45.1.10', previo } = {}) {
  const cadena = [previo, ip, '172.68.10.20'].filter(Boolean).join(', ');
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': cadena },
    body: JSON.stringify({ nombreUsuario, contrasena }),
  });
  return { status: r.status, json: await r.json(), retryAfter: r.headers.get('retry-after') };
}

const INCORRECTOS = 'Usuario o contraseña incorrectos';
const DEMASIADOS = 'Demasiados intentos. Probá de nuevo en unos minutos.';

describe('el mismo mensaje exista o no la cuenta', () => {
  test('contraseña incorrecta, cuenta inexistente, bloqueada o de una persona dada de baja: 401 idéntico', async () => {
    const respuestas = [
      await ingresar('amartinez', 'mal'),
      await ingresar('no-existe', CLAVE),
      await ingresar('pmedina', CLAVE),
      await ingresar('nvega', CLAVE),
      await ingresar('fantasma', CLAVE),
    ];
    for (const { status, json } of respuestas) {
      assert.equal(status, 401);
      assert.deepEqual(json, { error: INCORRECTOS });
    }
  });

  test('siempre se compara una contraseña, también si la cuenta no existe (mismo tiempo)', async () => {
    await ingresar('no-existe', CLAVE);
    await ingresar('pmedina', CLAVE);
    assert.equal(comparaciones, 2);
  });

  test('con la contraseña correcta entra', async () => {
    const { status, json } = await ingresar('amartinez', CLAVE);
    assert.equal(status, 200);
    assert.ok(json.token);
  });
});

describe('límite de intentos por nombre de usuario', () => {
  test(`G8: después de ${MAX_FALLOS_POR_USUARIO} fallos, 429 aunque la contraseña sea la correcta`, async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO; i++) {
      assert.equal((await ingresar('amartinez', `mal${i}`)).status, 401);
    }
    const bloqueado = await ingresar('amartinez', CLAVE);
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.json.error, DEMASIADOS);
    const segundos = Number(bloqueado.retryAfter);
    assert.ok(segundos > 0 && segundos <= 15 * 60, `Retry-After ${bloqueado.retryAfter}`);
  });

  test('las mayúsculas no esquivan el límite', async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO; i++) await ingresar(i % 2 ? 'AMartinez' : ' amartinez ', 'mal');
    assert.equal((await ingresar('amartinez', CLAVE)).status, 429);
  });

  test('vale igual para un usuario que no existe: el 429 no delata qué cuentas hay', async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO; i++) await ingresar('no-existe', 'mal');
    assert.equal((await ingresar('no-existe', 'mal')).status, 429);
  });

  test('un ingreso correcto borra los fallos de ese usuario', async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO - 1; i++) await ingresar('amartinez', 'mal');
    assert.equal((await ingresar('amartinez', CLAVE)).status, 200);
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO - 1; i++) await ingresar('amartinez', 'mal');
    assert.equal((await ingresar('amartinez', 'mal')).status, 401);
  });

  test('los fallos de un usuario no bloquean a otro', async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO; i++) await ingresar('no-existe', 'mal');
    assert.equal((await ingresar('amartinez', CLAVE)).status, 200);
  });
});

describe('límite de intentos por IP (la del cliente, detrás de Cloudflare y Render)', () => {
  // Muchos usuarios distintos desde la misma IP: ninguno llega a su propio tope.
  const probarDesde = async (ip, cantidad, previo) => {
    for (let i = 0; i < cantidad; i++) await ingresar(`usuario-${ip}-${i}`, 'mal', { ip, previo });
  };

  test(`después de ${MAX_FALLOS_POR_IP} fallos desde la misma IP, 429 para cualquier usuario`, async () => {
    await probarDesde('200.45.1.10', MAX_FALLOS_POR_IP);
    const { status } = await ingresar('amartinez', CLAVE, { ip: '200.45.1.10' });
    assert.equal(status, 429);
  });

  test('otra IP no queda bloqueada', async () => {
    await probarDesde('200.45.1.10', MAX_FALLOS_POR_IP);
    assert.equal((await ingresar('amartinez', CLAVE, { ip: '181.30.2.2' })).status, 200);
  });

  test('un X-Forwarded-For inventado por el cliente no cambia la IP que se cuenta', async () => {
    // Cada intento dice venir de otra IP, pero Cloudflare agrega la real después.
    for (let i = 0; i < MAX_FALLOS_POR_IP; i++) {
      await ingresar(`otro-${i}`, 'mal', { ip: '200.45.1.10', previo: `10.0.0.${i}` });
    }
    assert.equal((await ingresar('amartinez', CLAVE, { ip: '200.45.1.10', previo: '8.8.8.8' })).status, 429);
  });
});

describe('la ventana de 15 minutos', () => {
  // El mismo middleware con un reloj manejado por el test, delante de un login
  // de mentira que responde 200 con "ok" y 401 con cualquier otra contraseña.
  let reloj;
  let url;
  let srv;
  before(async () => {
    reloj = 1_000_000;
    const limite = crearLimiteLogin({ ahora: () => reloj });
    const mini = express();
    mini.use(express.json());
    mini.post('/login', limite.middleware, (req, res) => res.status(req.body.contrasena === 'ok' ? 200 : 401).json({}));
    await new Promise((resolver) => {
      srv = mini.listen(0, resolver);
    });
    url = `http://127.0.0.1:${srv.address().port}/login`;
  });
  after(() => new Promise((resolver) => srv.close(resolver)));

  const intento = async (contrasena) =>
    (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombreUsuario: 'x', contrasena }) })).status;

  test('el bloqueo dura hasta que el fallo más viejo sale de la ventana', async () => {
    for (let i = 0; i < MAX_FALLOS_POR_USUARIO; i++) {
      assert.equal(await intento('mal'), 401);
      reloj += 60_000;
    }
    assert.equal(await intento('ok'), 429);
    // El primer fallo fue hace 5 minutos: faltan 10 para que salga.
    reloj += 10 * 60_000 - 1;
    assert.equal(await intento('ok'), 429);
    reloj += 2;
    assert.equal(await intento('ok'), 200);
  });
});
