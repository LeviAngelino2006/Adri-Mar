// Tests de la cantidad de consultas del listado de viajes: las lecturas de
// odómetro (odometroInicial/odometroFinal/kmRealizados) se resuelven en lote
// para todos los viajes, así que el listado hace las mismas consultas de
// lecturas con 1 viaje que con 10.
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
// es c2 (57300).
function agregarViajeConCadena() {
  const { viaje, fin } = agregarViajeFinalizado(57110, 57400);
  agregarLectura({
    valorKm: 57999,
    origen: 'CORRECCION',
    lecturaCorregidaId: fin.id,
    creadoEn: new Date('2026-10-21T10:00:00Z'),
  });
  const c1 = agregarLectura({
    valorKm: 57350,
    origen: 'CORRECCION',
    lecturaCorregidaId: fin.id,
    creadoEn: new Date('2026-10-21T11:00:00Z'),
  });
  agregarLectura({
    valorKm: 57300,
    origen: 'CORRECCION',
    lecturaCorregidaId: c1.id,
    creadoEn: new Date('2026-10-21T12:00:00Z'),
  });
  return viaje;
}

async function listar() {
  const token = generarToken({ id: 10, personaId: 10, nombreUsuario: 'test', perfil: 'ADMINISTRADOR', habilitadoParaConducir: true });
  const respuesta = await fetch(`${base}/viajes`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(respuesta.status, 200);
  return (await respuesta.json()).viajes;
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
    // Las lecturas base y un nivel por eslabón de la cadena más larga (2), más
    // el nivel que confirma que no hay más correcciones.
    assert.equal(conUnViaje, 4);
  });

  test('resuelve la cadena de correcciones con la más reciente de cada nivel', async () => {
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
