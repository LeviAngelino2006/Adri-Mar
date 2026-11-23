// Tests de la cantidad de consultas del listado de viajes: las lecturas de
// odómetro (odometroInicial/odometroFinal/kmRealizados) se resuelven en lote
// para todos los viajes, así que el listado hace las mismas consultas de
// lecturas con 1 viaje que con 10. También GET /viajes/opciones-filtros, que
// arma los filtros de chofer y vehículo sin traer el listado entero.
//
// Levantan la app real de Express con un JWT real y el doble con estado de
// helpers/prismaFalsoConEstado.js. NO tocan la base ni leen el .env.

process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar, agregarViaje } = crearEntorno();

// Contador de consultas a lecturas_odometro: envuelve cada método del modelo.
let consultasLecturas = 0;
for (const [metodo, original] of Object.entries(prismaFalso.lecturaOdometro)) {
  prismaFalso.lecturaOdometro[metodo] = (...args) => {
    consultasLecturas++;
    return original(...args);
  };
}

instalarEnCache(SRC, prismaFalso);

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

beforeEach(() => {
  sembrar();
  consultasLecturas = 0;
});

const ORIGEN = { INICIO_VIAJE: 2, FIN_VIAJE: 3, CORRECCION: 5 };

function agregarLectura({ valorKm, origen, viajeId = null, lecturaCorregidaId = null, creadoEn }) {
  const fila = {
    id: db.siguienteId++,
    vehiculoId: 7,
    valorKm,
    fechaHora: new Date('2026-10-20T15:00:00Z'),
    origenId: ORIGEN[origen],
    viajeId,
    usuarioId: 10,
    lecturaCorregidaId,
    motivo: lecturaCorregidaId ? 'error de tipeo' : null,
    creadoEn: creadoEn ?? new Date('2026-10-20T15:00:00Z'),
  };
  db.lecturas.push(fila);
  return fila;
}

function agregarViajeFinalizado(kmInicio, kmFin) {
  const viaje = agregarViaje({ estado: 'FINALIZADO', choferId: 5, vehiculoId: 7 });
  agregarLectura({ valorKm: kmInicio, origen: 'INICIO_VIAJE', viajeId: viaje.id });
  const fin = agregarLectura({ valorKm: kmFin, origen: 'FIN_VIAJE', viajeId: viaje.id });
  return { viaje, fin };
}

// Un viaje cuya lectura de fin se corrigió dos veces en cadena (fin -> c1 -> c2),
// y además con una corrección más vieja de fin que perdió contra c1: la vigente
// es c2 (57300). Las correcciones llevan el viajeId del viaje, como las crea
// corregirLectura.
function agregarViajeConCadena() {
  const { viaje, fin } = agregarViajeFinalizado(57110, 57400);
  agregarLectura({
    valorKm: 57999,
    origen: 'CORRECCION',
    viajeId: viaje.id,
    lecturaCorregidaId: fin.id,
    creadoEn: new Date('2026-10-21T10:00:00Z'),
  });
  const c1 = agregarLectura({
    valorKm: 57350,
    origen: 'CORRECCION',
    viajeId: viaje.id,
    lecturaCorregidaId: fin.id,
    creadoEn: new Date('2026-10-21T11:00:00Z'),
  });
  agregarLectura({
    valorKm: 57300,
    origen: 'CORRECCION',
    viajeId: viaje.id,
    lecturaCorregidaId: c1.id,
    creadoEn: new Date('2026-10-21T12:00:00Z'),
  });
  return viaje;
}

async function pedir(ruta, perfil = 'ADMINISTRADOR') {
  const token = generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil, habilitadoParaConducir: true });
  const respuesta = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: respuesta.status, json: await respuesta.json() };
}

async function listar() {
  const { status, json } = await pedir('/viajes');
  assert.equal(status, 200);
  return json.viajes;
}

describe('GET /viajes: consultas de lecturas de odómetro', () => {
  test('hace las mismas consultas de lecturas con 10 viajes que con 1', async () => {
    agregarViajeConCadena();
    await listar();
    const conUnViaje = consultasLecturas;

    sembrar();
    consultasLecturas = 0;
    agregarViajeConCadena();
    for (let i = 0; i < 9; i++) agregarViajeFinalizado(10000 * (i + 1), 10000 * (i + 1) + 150);
    const viajes = await listar();

    assert.equal(viajes.length, 10);
    assert.equal(consultasLecturas, conUnViaje);
    // Una sola consulta trae todas las lecturas de los viajes, correcciones
    // incluidas: no depende de la cantidad de viajes ni del largo de la cadena.
    assert.equal(conUnViaje, 1);
  });

  test('resuelve la cadena de correcciones con la más reciente de cada eslabón', async () => {
    const conCadena = agregarViajeConCadena();
    const { viaje: comun } = agregarViajeFinalizado(80000, 80150);
    const sinLecturas = agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });

    const viajes = Object.fromEntries((await listar()).map((v) => [v.id, v]));

    assert.equal(viajes[conCadena.id].odometroInicial, 57110);
    assert.equal(viajes[conCadena.id].odometroFinal, 57300);
    assert.equal(viajes[conCadena.id].kmRealizados, 190);

    assert.equal(viajes[comun.id].odometroInicial, 80000);
    assert.equal(viajes[comun.id].odometroFinal, 80150);
    assert.equal(viajes[comun.id].kmRealizados, 150);

    assert.equal(viajes[sinLecturas.id].odometroInicial, null);
    assert.equal(viajes[sinLecturas.id].odometroFinal, null);
    assert.equal(viajes[sinLecturas.id].kmRealizados, null);
  });

  test('sin viajes no consulta lecturas', async () => {
    const viajes = await listar();
    assert.deepEqual(viajes, []);
    assert.equal(consultasLecturas, 0);
  });
});

describe('GET /viajes/opciones-filtros', () => {
  test('devuelve solo los choferes y vehículos que aparecen en algún viaje, sin repetir', async () => {
    agregarViaje({ estado: 'PROGRAMADO', choferId: 5, vehiculoId: 7 });
    agregarViaje({ estado: 'FINALIZADO', choferId: 5, vehiculoId: 9 });
    agregarViaje({ estado: 'CANCELADO', choferId: 6, vehiculoId: 7 });
    // A_CONFIRMAR sin chofer ni vehículo: no suma opciones.
    agregarViaje({ estado: 'A_CONFIRMAR' });

    const { status, json } = await pedir('/viajes/opciones-filtros');

    assert.equal(status, 200);
    assert.deepEqual(json, {
      choferes: [
        { id: 5, nombre: 'Ana', apellido: 'Pérez' },
        { id: 6, nombre: 'Beto', apellido: 'Gómez' },
      ],
      vehiculos: [
        { id: 7, dominio: 'AE452KD', numeroInterno: '12' },
        { id: 9, dominio: 'AE454KD', numeroInterno: '14' },
      ],
    });
  });

  test('Encargado puede usarlo; Personal de Taller no (lista a todos los choferes)', async () => {
    assert.equal((await pedir('/viajes/opciones-filtros', 'ENCARGADO')).status, 200);
    assert.equal((await pedir('/viajes/opciones-filtros', 'PERSONAL_TALLER')).status, 403);
  });

  test('un Chofer recibe 403, como en el listado', async () => {
    const { status } = await pedir('/viajes/opciones-filtros', 'CHOFER');
    assert.equal(status, 403);
  });
});
