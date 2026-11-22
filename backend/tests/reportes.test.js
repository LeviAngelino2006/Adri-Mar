process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const cba = (dia, hhmm) => new Date(`${dia}T${hhmm}:00-03:00`);

const db = {
  vehiculos: [],
  viajes: [],
  lecturas: [],
};

const prismaFalso = {
  vehiculo: {
    findMany: async () => [...db.vehiculos],
  },
  viaje: {
    findMany: async ({ where } = {}) => {
      const filtrados = db.viajes.filter((v) => {
        if (where?.estadoViaje?.descripcion && v.estadoViaje?.descripcion !== where.estadoViaje.descripcion) {
          return false;
        }
        if (where?.vehiculoId?.not === null && v.vehiculoId == null) {
          return false;
        }
        if (where?.fechaInicio) {
          if (!v.fechaInicio) return false;
          if (where.fechaInicio.gte && v.fechaInicio < where.fechaInicio.gte) return false;
          if (where.fechaInicio.lte && v.fechaInicio > where.fechaInicio.lte) return false;
        }
        return true;
      });
      filtrados.sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio) || b.id - a.id);
      return filtrados;
    },
  },
  lecturaOdometro: {
    findMany: async ({ where } = {}) => {
      const ids = where?.viajeId?.in ?? [];
      return db.lecturas
        .filter((l) => ids.includes(l.viajeId))
        .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn) || a.id - b.id);
    },
  },
};

const rutaPrisma = require.resolve(path.join(SRC, 'services', 'prismaClient.js'));
require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: prismaFalso };

const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
instalarSesionDelToken(SRC);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));
const { semanaActualCordoba } = require(path.join(SRC, 'services', 'reporteService.js'));

let servidor;
let base;

const tokenDe = (perfil) =>
  generarToken({ id: 10, personaId: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: false });

async function pedir(ruta, { perfil = 'ADMINISTRADOR', token } = {}) {
  const headers = {};
  if (token !== null) headers.Authorization = `Bearer ${token ?? tokenDe(perfil)}`;
  const res = await fetch(`${base}${ruta}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

function vehiculoFixture({ id, numeroInterno, dominio, marca = 'Mercedes-Benz', modelo = 'O500', tipo = 'Colectivo', tipoId = 1, estado = 'OPERATIVO', kilometraje = 100000 }) {
  return {
    id,
    numeroInterno,
    dominio,
    tipoVehiculoId: tipoId,
    tipoVehiculo: { id: tipoId, descripcion: tipo },
    estadoVehiculo: { id: 1, descripcion: estado },
    modelo: { id: id * 10, nombre: modelo, marca: { id: id * 10, nombre: marca } },
    kilometraje,
  };
}

function viajeFixture({ id, vehiculoId, estado = 'FINALIZADO', fechaInicio, kilometrosEstimados = null, origen = 'Río Tercero', destino = 'Córdoba', cliente = 'Colegio', choferNombre = 'Ana', choferApellido = 'Pérez', precio = 150000, pagoChofer = 30000 }) {
  return {
    id,
    vehiculoId,
    estadoViaje: { descripcion: estado },
    fechaInicio,
    kilometrosEstimados,
    origen: origen ? { id: 1, nombre: origen } : null,
    destino: destino ? { id: 2, nombre: destino } : null,
    cliente: cliente ? { id: 1, nombre: cliente } : null,
    chofer: choferNombre ? { id: 5, nombre: choferNombre, apellido: choferApellido, telefono: '3571123456' } : null,
    precio,
    pagoChofer,
  };
}

function lecturaFixture({ id, viajeId, vehiculoId = 1, origen, valorKm, lecturaCorregidaId = null, creadoEn }) {
  return {
    id,
    viajeId,
    vehiculoId,
    origen: { descripcion: origen },
    valorKm,
    lecturaCorregidaId,
    creadoEn: new Date(creadoEn),
  };
}

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/reportes`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  mock.timers.reset();
  db.vehiculos = [
    vehiculoFixture({ id: 1, numeroInterno: '12', dominio: 'AE452KD', kilometraje: 120500 }),
    vehiculoFixture({ id: 2, numeroInterno: '4', dominio: 'AA111BB', tipo: 'Minibús', tipoId: 2, marca: 'Iveco', modelo: 'Daily', estado: 'EN_TALLER', kilometraje: 85000 }),
    vehiculoFixture({ id: 3, numeroInterno: '2', dominio: 'AC222DD', estado: 'DADO_DE_BAJA', kilometraje: 240000 }),
  ];
  db.viajes = [];
  db.lecturas = [];
});

describe('semanaActualCordoba', () => {
  test('resuelve lunes a domingo en hora de Córdoba cuando en UTC ya es el día siguiente', () => {
    // 2026-11-22T01:30:00Z = sábado 21 nov 2026 22:30 ART
    const sabadoNocheArt = new Date('2026-11-22T01:30:00Z');
    assert.deepEqual(semanaActualCordoba(sabadoNocheArt), { desde: '2026-11-16', hasta: '2026-11-22' });

    // 2026-11-23T01:30:00Z = domingo 22 nov 2026 22:30 ART (todavía domingo en Córdoba)
    const domingoNocheArt = new Date('2026-11-23T01:30:00Z');
    assert.deepEqual(semanaActualCordoba(domingoNocheArt), { desde: '2026-11-16', hasta: '2026-11-22' });

    // 2026-11-23T03:00:00Z = lunes 23 nov 2026 00:00 ART (semana nueva)
    const lunesCeroArt = new Date('2026-11-23T03:00:00Z');
    assert.deepEqual(semanaActualCordoba(lunesCeroArt), { desde: '2026-11-23', hasta: '2026-11-29' });
  });
});

describe('GET /api/reportes/km-por-vehiculo', () => {
  test('permisos por perfil y autenticación', async () => {
    assert.equal((await pedir('/km-por-vehiculo', { token: null })).status, 401);
    assert.equal((await pedir('/km-por-vehiculo', { perfil: 'CHOFER' })).status, 403);
    assert.equal((await pedir('/km-por-vehiculo', { perfil: 'PERSONAL_TALLER' })).status, 403);
    assert.equal((await pedir('/km-por-vehiculo', { perfil: 'ENCARGADO' })).status, 200);
    assert.equal((await pedir('/km-por-vehiculo', { perfil: 'ADMINISTRADOR' })).status, 200);
  });

  test('validaciones de período devuelven 400 con errores por campo', async () => {
    const soloDesde = await pedir('/km-por-vehiculo?desde=2026-11-01');
    assert.equal(soloDesde.status, 400);
    assert.ok(soloDesde.body.errores.hasta);

    const soloHasta = await pedir('/km-por-vehiculo?hasta=2026-11-10');
    assert.equal(soloHasta.status, 400);
    assert.ok(soloHasta.body.errores.desde);

    const fechaImposible = await pedir('/km-por-vehiculo?desde=2026-02-30&hasta=2026-03-05');
    assert.equal(fechaImposible.status, 400);
    assert.ok(fechaImposible.body.errores.desde);

    const invertido = await pedir('/km-por-vehiculo?desde=2026-11-20&hasta=2026-11-10');
    assert.equal(invertido.status, 400);
    assert.ok(invertido.body.errores.hasta);

    const muyLargo = await pedir('/km-por-vehiculo?desde=2025-01-01&hasta=2026-06-01');
    assert.equal(muyLargo.status, 400);
    assert.ok(muyLargo.body.errores.hasta);
  });

  test('sin parámetros usa la semana actual de Córdoba y respeta bordes del día ART', async () => {
    // Sábado 21 nov 2026 22:30 ART (domingo UTC)
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-22T01:30:00Z') });

    db.viajes = [
      // Domingo 22 nov 22:30 ART → entra en la semana 16..22
      viajeFixture({ id: 1, vehiculoId: 1, fechaInicio: cba('2026-11-22', '22:30'), kilometrosEstimados: 100 }),
      // Domingo 15 nov 23:59 ART → semana anterior, no entra
      viajeFixture({ id: 2, vehiculoId: 1, fechaInicio: cba('2026-11-15', '23:59'), kilometrosEstimados: 100 }),
    ];
    db.lecturas = [
      lecturaFixture({ id: 11, viajeId: 1, origen: 'INICIO_VIAJE', valorKm: 10000, creadoEn: '2026-11-22T22:30:00-03:00' }),
      lecturaFixture({ id: 12, viajeId: 1, origen: 'FIN_VIAJE', valorKm: 10120, creadoEn: '2026-11-22T23:50:00-03:00' }),
    ];

    const { status, body } = await pedir('/km-por-vehiculo');
    assert.equal(status, 200);
    assert.deepEqual(body.periodo, { desde: '2026-11-16', hasta: '2026-11-22' });
    assert.equal(body.totales.cantidadViajes, 1);
    assert.equal(body.totales.kmRecorridos, 120);
  });

  test('calcula km con correcciones encadenadas, filtra no finalizados, maneja viajes sin odómetro y dados de baja', async () => {
    db.viajes = [
      // Viaje 1 (vehículo 1): inicio corregido 2 veces (1000 -> 1050 -> 1100), fin corregido 1 vez (1500 -> 1420) => 320 km
      viajeFixture({ id: 1, vehiculoId: 1, fechaInicio: cba('2026-11-18', '08:00'), kilometrosEstimados: 300 }),
      // Viaje 2 (vehículo 1): sin lecturas de odómetro => suma en cantidadViajes y viajesSinOdometro, no contamina desvío ni promedio
      viajeFixture({ id: 2, vehiculoId: 1, fechaInicio: cba('2026-11-19', '10:00'), kilometrosEstimados: 200 }),
      // Viaje 3 (vehículo 2 EN_TALLER): 180 km vs 200 estimados => -20 km (-10 %)
      viajeFixture({ id: 3, vehiculoId: 2, fechaInicio: cba('2026-11-20', '09:00'), kilometrosEstimados: 200 }),
      // Viajes en otros estados que NO deben contar
      viajeFixture({ id: 4, vehiculoId: 1, estado: 'PROGRAMADO', fechaInicio: cba('2026-11-20', '12:00') }),
      viajeFixture({ id: 5, vehiculoId: 1, estado: 'EN_VIAJE', fechaInicio: cba('2026-11-20', '14:00') }),
      viajeFixture({ id: 6, vehiculoId: 1, estado: 'CANCELADO', fechaInicio: cba('2026-11-20', '16:00') }),
      viajeFixture({ id: 7, vehiculoId: 1, estado: 'A_CONFIRMAR', fechaInicio: cba('2026-11-20', '18:00') }),
    ];

    db.lecturas = [
      lecturaFixture({ id: 100, viajeId: 1, origen: 'INICIO_VIAJE', valorKm: 1000, creadoEn: '2026-11-18T08:00:00-03:00' }),
      lecturaFixture({ id: 101, viajeId: 1, origen: 'CORRECCION', valorKm: 1050, lecturaCorregidaId: 100, creadoEn: '2026-11-18T09:00:00-03:00' }),
      lecturaFixture({ id: 102, viajeId: 1, origen: 'CORRECCION', valorKm: 1100, lecturaCorregidaId: 101, creadoEn: '2026-11-18T09:30:00-03:00' }),
      lecturaFixture({ id: 103, viajeId: 1, origen: 'FIN_VIAJE', valorKm: 1500, creadoEn: '2026-11-18T12:00:00-03:00' }),
      lecturaFixture({ id: 104, viajeId: 1, origen: 'CORRECCION', valorKm: 1420, lecturaCorregidaId: 103, creadoEn: '2026-11-18T12:30:00-03:00' }),

      lecturaFixture({ id: 200, viajeId: 3, origen: 'INICIO_VIAJE', valorKm: 50000, creadoEn: '2026-11-20T09:00:00-03:00' }),
      lecturaFixture({ id: 201, viajeId: 3, origen: 'FIN_VIAJE', valorKm: 50180, creadoEn: '2026-11-20T12:00:00-03:00' }),
    ];

    const { status, body } = await pedir('/km-por-vehiculo?desde=2026-11-16&hasta=2026-11-22');
    assert.equal(status, 200);

    // El vehículo dado de baja (id: 3) no tuvo viajes -> no aparece; activos = 2 (id 1 y id 2)
    assert.equal(body.vehiculos.length, 2);
    assert.equal(body.totales.vehiculosActivos, 2);
    assert.equal(body.totales.vehiculosConViajes, 2);
    assert.equal(body.totales.kmRecorridos, 500);
    assert.equal(body.totales.cantidadViajes, 3);
    assert.equal(body.totales.viajesSinOdometro, 1);
    assert.equal(body.totales.promedioKmPorViaje, 250); // 500 / 2 viajes con odómetro
    assert.equal(body.totales.kmRealesComparables, 500);
    assert.equal(body.totales.kmEstimadosComparables, 500); // 300 + 200 (el viaje 2 no tiene odómetro)
    assert.equal(body.totales.desvioKm, 0);
    assert.equal(body.totales.desvioPorcentaje, 0);

    // Ordenado por km descendente: primero vehículo 1 (320 km), luego vehículo 2 (180 km)
    const [v1, v2] = body.vehiculos;
    assert.equal(v1.vehiculo.id, 1);
    assert.equal(v1.kmRecorridos, 320);
    assert.equal(v1.cantidadViajes, 2);
    assert.equal(v1.viajesSinOdometro, 1);
    assert.equal(v1.promedioKmPorViaje, 320);
    assert.equal(v1.porcentajeKmTotal, 64);
    assert.equal(v1.desvioKm, 20);
    assert.equal(v1.desvioPorcentaje, 6.7);

    // Verifica que no expone precio, pagoChofer ni teléfono en el desglose
    const viajeSerializado = v1.viajes[0];
    assert.equal('precio' in viajeSerializado, false);
    assert.equal('pagoChofer' in viajeSerializado, false);
    assert.equal('telefono' in viajeSerializado, false);
    assert.equal(viajeSerializado.kmRealizados, null); // viaje 2 (más reciente) sin odómetro

    assert.equal(v2.vehiculo.id, 2);
    assert.equal(v2.kmRecorridos, 180);
    assert.equal(v2.porcentajeKmTotal, 36);
    assert.equal(v2.desvioKm, -20);
    assert.equal(v2.desvioPorcentaje, -10);
  });

  test('incluye vehículos activos con 0 viajes y vehículos DADO_DE_BAJA si tuvieron viajes en el período', async () => {
    db.viajes = [
      viajeFixture({ id: 10, vehiculoId: 3, fechaInicio: cba('2026-11-17', '10:00'), kilometrosEstimados: 100 }),
    ];
    db.lecturas = [
      lecturaFixture({ id: 300, viajeId: 10, origen: 'INICIO_VIAJE', valorKm: 200000, creadoEn: '2026-11-17T10:00:00-03:00' }),
      lecturaFixture({ id: 301, viajeId: 10, origen: 'FIN_VIAJE', valorKm: 200105, creadoEn: '2026-11-17T11:30:00-03:00' }),
    ];

    const { status, body } = await pedir('/km-por-vehiculo?desde=2026-11-16&hasta=2026-11-22');
    assert.equal(status, 200);

    // Ahora aparecen los 3: el dado de baja (con 105 km) + los 2 activos con 0 viajes
    assert.equal(body.vehiculos.length, 3);
    assert.equal(body.vehiculos[0].vehiculo.id, 3);
    assert.equal(body.vehiculos[0].vehiculo.estado, 'DADO_DE_BAJA');
    assert.equal(body.vehiculos[0].kmRecorridos, 105);
    assert.equal(body.vehiculos[1].cantidadViajes, 0);
    assert.equal(body.vehiculos[2].cantidadViajes, 0);
    // vehiculosActivos sigue siendo 2 (no cuenta al dado de baja)
    assert.equal(body.totales.vehiculosActivos, 2);
    assert.equal(body.totales.vehiculosConViajes, 1);
  });

  test('devuelve porTipoVehiculo, kmEstimadosComparables y serieTemporal con granularidad automática', async () => {
    db.viajes = [
      // 18 nov 22:30 ART → día 2026-11-18 (Colectivo, 320 km vs 300 est.)
      viajeFixture({ id: 1, vehiculoId: 1, fechaInicio: cba('2026-11-18', '22:30'), kilometrosEstimados: 300 }),
      // 20 nov 09:00 ART → día 2026-11-20 (Minibús, 180 km vs 200 est.)
      viajeFixture({ id: 2, vehiculoId: 2, fechaInicio: cba('2026-11-20', '09:00'), kilometrosEstimados: 200 }),
    ];
    db.lecturas = [
      lecturaFixture({ id: 1, viajeId: 1, origen: 'INICIO_VIAJE', valorKm: 1000, creadoEn: '2026-11-18T22:30:00-03:00' }),
      lecturaFixture({ id: 2, viajeId: 1, origen: 'FIN_VIAJE', valorKm: 1320, creadoEn: '2026-11-18T23:50:00-03:00' }),
      lecturaFixture({ id: 3, viajeId: 2, origen: 'INICIO_VIAJE', valorKm: 5000, creadoEn: '2026-11-20T09:00:00-03:00' }),
      lecturaFixture({ id: 4, viajeId: 2, origen: 'FIN_VIAJE', valorKm: 5180, creadoEn: '2026-11-20T12:00:00-03:00' }),
    ];

    const semanal = await pedir('/km-por-vehiculo?desde=2026-11-16&hasta=2026-11-22');
    assert.equal(semanal.status, 200);
    assert.equal(semanal.body.vehiculos[0].kmEstimadosComparables, 300);
    assert.equal(semanal.body.vehiculos[1].kmEstimadosComparables, 200);

    // porTipoVehiculo ordenado por km descendente: Colectivo (320) luego Minibús (180)
    assert.deepEqual(semanal.body.porTipoVehiculo, [
      {
        tipoVehiculoId: 1,
        tipoVehiculo: 'Colectivo',
        kmRecorridos: 320,
        cantidadViajes: 1,
        vehiculosConViajes: 1,
        vehiculosActivos: 1,
        promedioKmPorViaje: 320,
      },
      {
        tipoVehiculoId: 2,
        tipoVehiculo: 'Minibús',
        kmRecorridos: 180,
        cantidadViajes: 1,
        vehiculosConViajes: 1,
        vehiculosActivos: 1,
        promedioKmPorViaje: 180,
      },
    ]);

    // Serie diaria: 7 puntos contiguos, los días sin viajes en 0
    assert.equal(semanal.body.granularidadTemporal, 'dia');
    assert.equal(semanal.body.serieTemporal.length, 7);
    assert.deepEqual(semanal.body.serieTemporal[0], {
      clave: '2026-11-16',
      desde: '2026-11-16',
      hasta: '2026-11-16',
      kmRecorridos: 0,
      cantidadViajes: 0,
    });
    assert.equal(semanal.body.serieTemporal[2].kmRecorridos, 320); // 18 nov (pese a 22:30 ART = 01:30 UTC del 19)
    assert.equal(semanal.body.serieTemporal[4].kmRecorridos, 180); // 20 nov

    // Rango de 60 días → granularidad semanal
    const sesentaDias = await pedir('/km-por-vehiculo?desde=2026-09-01&hasta=2026-10-30');
    assert.equal(sesentaDias.status, 200);
    assert.equal(sesentaDias.body.granularidadTemporal, 'semana');
    assert.ok(sesentaDias.body.serieTemporal.length >= 9);

    // Rango de 240 días → granularidad mensual
    const anual = await pedir('/km-por-vehiculo?desde=2026-01-01&hasta=2026-08-31');
    assert.equal(anual.status, 200);
    assert.equal(anual.body.granularidadTemporal, 'mes');
    assert.equal(anual.body.serieTemporal.length, 8);
  });
});
