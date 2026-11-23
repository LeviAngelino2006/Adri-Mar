// Tests del endpoint GET /api/dashboard/indicadores (SCRUM-262, SCRUM-281):
// - Períodos "mes" (por defecto) y "semana" en hora de Córdoba (UTC-3).
// - Cálculo de km recorridos respetando correcciones de odómetro y viajes sin odómetro.
// - Resumen de flota excluyendo vehículos dados de baja y conteo de operativos vs. en taller.
// - Alertas de mantenimiento ordenadas por urgencia (VENCIDO primero, luego PROXIMO) y por interno.
// - Visibilidad por perfil: ADMINISTRADOR/ENCARGADO ven todo; PERSONAL_TALLER solo flota y mantenimiento; CHOFER 403.

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
    findMany: async ({ where } = {}) => {
      const excluido = where?.estadoVehiculo?.descripcion?.not;
      return db.vehiculos.filter((v) => !excluido || v.estadoVehiculo?.descripcion !== excluido);
    },
  },
  viaje: {
    findMany: async ({ where } = {}) =>
      db.viajes.filter((v) => {
        if (where?.estadoViaje?.descripcion && v.estadoViaje?.descripcion !== where.estadoViaje.descripcion) {
          return false;
        }
        if (where?.fechaInicio) {
          if (!v.fechaInicio) return false;
          if (where.fechaInicio.gte && v.fechaInicio < where.fechaInicio.gte) return false;
          if (where.fechaInicio.lte && v.fechaInicio > where.fechaInicio.lte) return false;
        }
        return true;
      }),
    count: async ({ where } = {}) =>
      db.viajes.filter((v) => !where?.estadoViaje?.descripcion || v.estadoViaje?.descripcion === where.estadoViaje.descripcion).length,
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

function vehiculoFixture({
  id,
  numeroInterno,
  dominio,
  estado = 'OPERATIVO',
  kilometraje = 100000,
  planActivo = true,
  kmUltimoService = 90000,
  intervaloKm = 20000,
  porcentajeAviso = 95,
}) {
  return {
    id,
    numeroInterno,
    dominio,
    tipoVehiculoId: 1,
    tipoVehiculo: { id: 1, descripcion: 'Colectivo', plantilla: { id: 1, nombre: 'Colectivo', intervaloKm, porcentajeAviso } },
    estadoVehiculo: { id: 1, descripcion: estado },
    modelo: { id: id * 10, nombre: 'O500', marca: { id: id * 10, nombre: 'Mercedes-Benz' } },
    kilometraje,
    planMantenimiento: planActivo
      ? {
          id,
          activo: true,
          kmUltimoService,
          plantillaMantenimiento: { id: 1, nombre: 'Colectivo', intervaloKm, porcentajeAviso },
        }
      : null,
  };
}

function viajeFixture({ id, vehiculoId = 1, estado = 'FINALIZADO', fechaInicio }) {
  return {
    id,
    vehiculoId,
    estadoViaje: { descripcion: estado },
    fechaInicio,
  };
}

function lecturaFixture({ id, viajeId, origen, valorKm, lecturaCorregidaId = null, creadoEn }) {
  return {
    id,
    viajeId,
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
  base = `http://127.0.0.1:${servidor.address().port}/api/dashboard`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  mock.timers.reset();
  db.vehiculos = [];
  db.viajes = [];
  db.lecturas = [];
});

describe('GET /api/dashboard/indicadores (SCRUM-262, SCRUM-281)', () => {
  test('ADMINISTRADOR y ENCARGADO reciben indicadores de mes por defecto y semana por query en hora Córdoba', async () => {
    // 2026-11-22 (domingo en Córdoba, semana 16..22 nov; mes 01..30 nov).
    mock.timers.enable({ apis: ['Date'], now: cba('2026-11-22', '12:00') });

    db.vehiculos = [
      vehiculoFixture({ id: 1, numeroInterno: '12', dominio: 'AE452KD', estado: 'OPERATIVO', kilometraje: 120500, kmUltimoService: 100000 }), // VENCIDO (+500)
      vehiculoFixture({ id: 2, numeroInterno: '4', dominio: 'AB123CD', estado: 'EN_TALLER', kilometraje: 119200, kmUltimoService: 100000 }), // PROXIMO (96%)
      vehiculoFixture({ id: 3, numeroInterno: '8', dominio: 'AC999EF', estado: 'OPERATIVO', kilometraje: 105000, kmUltimoService: 100000 }), // AL_DIA
      vehiculoFixture({ id: 4, numeroInterno: '15', dominio: 'AD111GH', estado: 'OPERATIVO', planActivo: false }), // SIN_PLAN
      vehiculoFixture({ id: 5, numeroInterno: '99', dominio: 'ZZ999ZZ', estado: 'DADO_DE_BAJA', kilometraje: 150000, kmUltimoService: 100000 }), // excluido
    ];

    db.viajes = [
      // Mes anterior (octubre): excluido de mes y semana.
      viajeFixture({ id: 1, fechaInicio: cba('2026-10-31', '23:30') }),
      // Principio de noviembre (fuera de la semana 16..22 nov, dentro del mes).
      viajeFixture({ id: 2, fechaInicio: cba('2026-11-05', '10:00') }),
      // Dentro de la semana actual (16..22 nov), con corrección de odómetro final.
      viajeFixture({ id: 3, fechaInicio: cba('2026-11-18', '08:00') }),
      // Finalizado sin lecturas de odómetro.
      viajeFixture({ id: 4, fechaInicio: cba('2026-11-21', '14:00') }),
      // Pendientes actuales.
      viajeFixture({ id: 5, estado: 'EN_VIAJE', fechaInicio: cba('2026-11-22', '09:00') }),
      viajeFixture({ id: 6, estado: 'PROGRAMADO', fechaInicio: cba('2026-11-23', '09:00') }),
      viajeFixture({ id: 7, estado: 'A_CONFIRMAR', fechaInicio: cba('2026-11-24', '09:00') }),
    ];

    db.lecturas = [
      lecturaFixture({ id: 10, viajeId: 2, origen: 'INICIO_VIAJE', valorKm: 10000, creadoEn: '2026-11-05T13:00:00Z' }),
      lecturaFixture({ id: 11, viajeId: 2, origen: 'FIN_VIAJE', valorKm: 10400, creadoEn: '2026-11-05T18:00:00Z' }),
      lecturaFixture({ id: 12, viajeId: 3, origen: 'INICIO_VIAJE', valorKm: 20000, creadoEn: '2026-11-18T11:00:00Z' }),
      lecturaFixture({ id: 13, viajeId: 3, origen: 'FIN_VIAJE', valorKm: 20900, creadoEn: '2026-11-18T16:00:00Z' }),
      lecturaFixture({ id: 14, viajeId: 3, origen: 'CORRECCION', valorKm: 20600, lecturaCorregidaId: 13, creadoEn: '2026-11-18T17:00:00Z' }),
    ];

    const resMes = await pedir('/indicadores', { perfil: 'ADMINISTRADOR' });
    assert.equal(resMes.status, 200);
    assert.deepEqual(resMes.body.periodo, { tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' });
    assert.deepEqual(resMes.body.flota, { totalActivos: 4, operativos: 3, enTaller: 1 });
    assert.equal(resMes.body.mantenimiento.vencidos, 1);
    assert.equal(resMes.body.mantenimiento.proximos, 1);
    assert.equal(resMes.body.mantenimiento.alDia, 1);
    assert.equal(resMes.body.mantenimiento.sinPlan, 1);
    assert.deepEqual(
      resMes.body.mantenimiento.alertas.map((a) => [a.vehiculo.numeroInterno, a.estado]),
      [
        ['12', 'VENCIDO'],
        ['4', 'PROXIMO'],
      ]
    );
    assert.deepEqual(resMes.body.km, {
      totalRecorridos: 1000, // 400 (viaje 2) + 600 (viaje 3 corregido)
      promedioPorViaje: 500,
      viajesConOdometro: 2,
      viajesSinOdometro: 1,
    });
    assert.deepEqual(resMes.body.viajes, {
      finalizadosPeriodo: 3,
      enViajeAhora: 1,
      programadosProximos: 1,
      porConfirmarPendientes: 1,
    });

    const resSemana = await pedir('/indicadores?periodo=semana', { perfil: 'ENCARGADO' });
    assert.equal(resSemana.status, 200);
    assert.deepEqual(resSemana.body.periodo, { tipo: 'semana', desde: '2026-11-16', hasta: '2026-11-22' });
    assert.deepEqual(resSemana.body.km, {
      totalRecorridos: 600,
      promedioPorViaje: 600,
      viajesConOdometro: 1,
      viajesSinOdometro: 1,
    });
    assert.equal(resSemana.body.viajes.finalizadosPeriodo, 2);
  });

  test('ordena alertas de mantenimiento por urgencia y desempata por número de interno natural', async () => {
    db.vehiculos = [
      vehiculoFixture({ id: 1, numeroInterno: '10', dominio: 'AA100AA', kilometraje: 119200, kmUltimoService: 100000 }), // PROXIMO 96%
      vehiculoFixture({ id: 2, numeroInterno: '2', dominio: 'AA200AA', kilometraje: 119200, kmUltimoService: 100000 }), // PROXIMO 96%
      vehiculoFixture({ id: 3, numeroInterno: '5', dominio: 'AA500AA', kilometraje: 121000, kmUltimoService: 100000 }), // VENCIDO 105%
      vehiculoFixture({ id: 4, numeroInterno: '7', dominio: 'AA700AA', kilometraje: 123000, kmUltimoService: 100000 }), // VENCIDO 115%
    ];

    const { status, body } = await pedir('/indicadores');
    assert.equal(status, 200);
    assert.deepEqual(
      body.mantenimiento.alertas.map((a) => a.vehiculo.numeroInterno),
      ['7', '5', '2', '10']
    );
  });

  test('PERSONAL_TALLER recibe solo flota y mantenimiento (sin km ni viajes)', async () => {
    db.vehiculos = [
      vehiculoFixture({ id: 1, numeroInterno: '12', dominio: 'AE452KD', estado: 'EN_TALLER', kilometraje: 120500, kmUltimoService: 100000 }),
    ];

    const { status, body } = await pedir('/indicadores', { perfil: 'PERSONAL_TALLER' });
    assert.equal(status, 200);
    assert.deepEqual(body.flota, { totalActivos: 1, operativos: 0, enTaller: 1 });
    assert.equal(body.mantenimiento.vencidos, 1);
    assert.equal('km' in body, false);
    assert.equal('viajes' in body, false);
  });

  test('CHOFER recibe 403, sin token recibe 401 y período inválido recibe 400', async () => {
    assert.equal((await pedir('/indicadores', { token: null })).status, 401);
    assert.equal((await pedir('/indicadores', { perfil: 'CHOFER' })).status, 403);

    const invalido = await pedir('/indicadores?periodo=anio', { perfil: 'ADMINISTRADOR' });
    assert.equal(invalido.status, 400);
    assert.deepEqual(invalido.body.errores, { periodo: 'El período debe ser "semana" o "mes"' });
  });
});
