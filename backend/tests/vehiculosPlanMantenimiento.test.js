// Plan de service automático: el alta de un vehículo le crea el plan con la
// plantilla de su tipo, y editar el tipo actualiza la plantilla del plan.
//
// Prueba vehiculoService directamente (sin levantar la app) con un doble de
// Prisma en memoria acotado a lo que usan crearVehiculo, actualizarVehiculo y
// crearLectura. La transacción tiene rollback real: si algo falla, no queda ni
// el vehículo, ni la lectura, ni el plan.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const { instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const TIPOS = { COLECTIVO: 1, TRAFIC: 3, SIN_PLANTILLA: 9 };
const ESTADOS = { 1: 'OPERATIVO', 2: 'EN_TALLER', 3: 'DADO_DE_BAJA' };

const db = { vehiculos: [], lecturas: [], planes: [], plantillas: [], siguienteId: 100 };

function sembrar() {
  db.vehiculos = [];
  db.lecturas = [];
  db.planes = [];
  db.siguienteId = 100;
  // Una plantilla por tipo, salvo SIN_PLANTILLA (un tipo cargado sin plantilla).
  db.plantillas = [
    { id: 11, tipoVehiculoId: TIPOS.COLECTIVO, intervaloKm: 20000, porcentajeAviso: 95 },
    { id: 13, tipoVehiculoId: TIPOS.TRAFIC, intervaloKm: 15000, porcentajeAviso: 95 },
  ];
}

const descripcionTipo = (id) => Object.keys(TIPOS).find((k) => TIPOS[k] === id);
const plantillaDe = (tipoVehiculoId) => db.plantillas.find((p) => p.tipoVehiculoId === tipoVehiculoId) ?? null;

// Vehículo con lo que piden INCLUDE_VEHICULO y { planMantenimiento: true }.
function armarVehiculo(v) {
  return {
    ...v,
    modelo: { id: v.modeloId, nombre: 'O500', marcaId: 1, marca: { id: 1, nombre: 'Mercedes' } },
    tipoVehiculo: { id: v.tipoVehiculoId, descripcion: descripcionTipo(v.tipoVehiculoId), orden: v.tipoVehiculoId },
    estadoVehiculo: { id: v.estadoVehiculoId, descripcion: ESTADOS[v.estadoVehiculoId] },
    planMantenimiento: db.planes.find((p) => p.vehiculoId === v.id) ?? null,
  };
}

function buscarVehiculo(where) {
  if (where.dominio) return db.vehiculos.find((v) => v.dominio === where.dominio);
  return db.vehiculos.find((v) => v.id === where.id);
}

const modelosTx = {
  $queryRaw: async (_partes, id) => (db.vehiculos.some((v) => v.id === id) ? [{ id }] : []),
  vehiculo: {
    create: async ({ data }) => {
      const fila = { id: db.siguienteId++, creadoEn: new Date(), fechaBaja: null, adquiridoUsado: false, ...data };
      db.vehiculos.push(fila);
      return { ...fila };
    },
    findUnique: async ({ where }) => {
      const v = buscarVehiculo(where);
      return v ? armarVehiculo(v) : null;
    },
    update: async ({ where, data }) => {
      const v = buscarVehiculo(where);
      Object.assign(v, data);
      return armarVehiculo(v);
    },
  },
  lecturaOdometro: {
    findFirst: async ({ where: { vehiculoId } }) =>
      db.lecturas.filter((l) => l.vehiculoId === vehiculoId).at(-1) ?? null,
    create: async ({ data }) => {
      const fila = { id: db.siguienteId++, ...data };
      db.lecturas.push(fila);
      return { ...fila, origen: { id: data.origenId, descripcion: 'ALTA_VEHICULO' } };
    },
  },
  origenLectura: {
    findUnique: async ({ where: { descripcion } }) => ({ id: 1, descripcion }),
  },
  planMantenimiento: {
    create: async ({ data }) => {
      if (db.planes.some((p) => p.vehiculoId === data.vehiculoId)) {
        throw new Error('Unique constraint failed on (vehiculo_id)');
      }
      if (db.fallarAlCrearPlan) throw new Error('falla simulada al crear el plan');
      const fila = { id: db.siguienteId++, activo: true, ...data };
      db.planes.push(fila);
      return { ...fila };
    },
    update: async ({ where: { id }, data }) => {
      const p = db.planes.find((x) => x.id === id);
      Object.assign(p, data);
      return { ...p };
    },
  },
};

const prismaFalso = {
  vehiculo: { findUnique: modelosTx.vehiculo.findUnique },
  tipoVehiculo: {
    findUnique: async ({ where: { id }, include }) => {
      if (!descripcionTipo(id)) return null;
      const tipo = { id, descripcion: descripcionTipo(id), orden: id };
      return include?.plantilla ? { ...tipo, plantilla: plantillaDe(id) } : tipo;
    },
  },
  modelo: { findUnique: async ({ where: { id } }) => (id === 1 ? { id } : null) },
  estadoVehiculo: {
    findUnique: async ({ where: { descripcion } }) => {
      const id = Number(Object.keys(ESTADOS).find((k) => ESTADOS[k] === descripcion));
      return id ? { id, descripcion } : null;
    },
  },
  $transaction: async (fn) => {
    const copia = structuredClone({ vehiculos: db.vehiculos, lecturas: db.lecturas, planes: db.planes });
    try {
      return await fn(modelosTx);
    } catch (err) {
      Object.assign(db, copia);
      throw err;
    }
  },
};

instalarEnCache(SRC, prismaFalso);
const vehiculoService = require(path.join(SRC, 'services', 'vehiculoService.js'));

const USUARIO = { usuarioId: 5 };
const datosAlta = (extra = {}) => ({
  dominio: 'AB123CD',
  numeroInterno: '21',
  modeloId: 1,
  anio: 2020,
  asientos: 40,
  kilometraje: 150000,
  tipoVehiculoId: TIPOS.COLECTIVO,
  ...extra,
});
const planDe = (vehiculoId) => db.planes.find((p) => p.vehiculoId === vehiculoId);

beforeEach(sembrar);

describe('alta de vehículo: plan de service automático', () => {
  test('crea el plan con la plantilla de su tipo y el km de alta como último service', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta(), USUARIO);

    const plan = planDe(vehiculo.id);
    assert.ok(plan, 'el vehículo nuevo tiene que tener plan');
    assert.equal(plan.plantillaMantenimientoId, 11);
    assert.equal(plan.kmUltimoService, 150000);
    assert.equal(plan.activo, true);
  });

  test('usa la plantilla del tipo elegido (Trafic)', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta({ tipoVehiculoId: TIPOS.TRAFIC }), USUARIO);
    assert.equal(planDe(vehiculo.id).plantillaMantenimientoId, 13);
  });

  test('con km del último service, lo usa en vez del km de alta', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta({ kmUltimoService: '142000' }), USUARIO);
    assert.equal(planDe(vehiculo.id).kmUltimoService, 142000);
  });

  test('el km del último service vacío o null cuenta como no cargado', async () => {
    const a = await vehiculoService.crearVehiculo(datosAlta({ kmUltimoService: '' }), USUARIO);
    const b = await vehiculoService.crearVehiculo(datosAlta({ dominio: 'AB124CD', kmUltimoService: null }), USUARIO);
    assert.equal(planDe(a.id).kmUltimoService, 150000);
    assert.equal(planDe(b.id).kmUltimoService, 150000);
  });

  test('rechaza un km del último service mayor al de alta o inválido, sin crear nada', async () => {
    await assert.rejects(
      vehiculoService.crearVehiculo(datosAlta({ kmUltimoService: 150001 }), USUARIO),
      (err) => err instanceof vehiculoService.ValidacionError && /no puede superar/.test(err.errores.kmUltimoService)
    );
    for (const invalido of [-1, 12.5, 'abc']) {
      await assert.rejects(
        vehiculoService.crearVehiculo(datosAlta({ kmUltimoService: invalido }), USUARIO),
        (err) => err instanceof vehiculoService.ValidacionError && Boolean(err.errores.kmUltimoService)
      );
    }
    assert.equal(db.vehiculos.length, 0);
    assert.equal(db.planes.length, 0);
  });

  test('si el tipo no tiene plantilla, el alta se hace igual y queda sin plan', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta({ tipoVehiculoId: TIPOS.SIN_PLANTILLA }), USUARIO);
    assert.equal(db.vehiculos.length, 1);
    assert.equal(planDe(vehiculo.id), undefined);
  });

  test('si falla la creación del plan, no queda el vehículo ni su lectura de alta', async () => {
    db.fallarAlCrearPlan = true;
    try {
      await assert.rejects(vehiculoService.crearVehiculo(datosAlta(), USUARIO), /falla simulada/);
    } finally {
      db.fallarAlCrearPlan = false;
    }
    assert.equal(db.vehiculos.length, 0);
    assert.equal(db.lecturas.length, 0);
    assert.equal(db.planes.length, 0);
  });
});

describe('edición de vehículo: el plan sigue al tipo', () => {
  const datosEdicion = (vehiculo, extra = {}) => ({
    dominio: vehiculo.dominio,
    numeroInterno: vehiculo.numeroInterno,
    modeloId: 1,
    anio: 2020,
    asientos: 40,
    tipoVehiculoId: vehiculo.tipoVehiculoId,
    ...extra,
  });

  test('al cambiar de tipo, el plan pasa a la plantilla nueva y conserva el último service', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta({ kmUltimoService: 140000 }), USUARIO);

    await vehiculoService.actualizarVehiculo(vehiculo.id, datosEdicion(vehiculo, { tipoVehiculoId: TIPOS.TRAFIC }));

    const plan = planDe(vehiculo.id);
    assert.equal(plan.plantillaMantenimientoId, 13);
    assert.equal(plan.kmUltimoService, 140000);
    assert.equal(plan.activo, true);
  });

  test('si el tipo nuevo no tiene plantilla, el plan se desactiva (SIN_PLAN)', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta(), USUARIO);

    await vehiculoService.actualizarVehiculo(
      vehiculo.id,
      datosEdicion(vehiculo, { tipoVehiculoId: TIPOS.SIN_PLANTILLA })
    );

    assert.equal(planDe(vehiculo.id).activo, false);
  });

  test('si no tenía plan y el tipo nuevo tiene plantilla, se le crea desde el odómetro actual', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta({ tipoVehiculoId: TIPOS.SIN_PLANTILLA }), USUARIO);

    await vehiculoService.actualizarVehiculo(vehiculo.id, datosEdicion(vehiculo, { tipoVehiculoId: TIPOS.COLECTIVO }));

    const plan = planDe(vehiculo.id);
    assert.equal(plan.plantillaMantenimientoId, 11);
    assert.equal(plan.kmUltimoService, 150000);
  });

  test('sin cambio de tipo, el plan no se toca', async () => {
    const vehiculo = await vehiculoService.crearVehiculo(datosAlta(), USUARIO);
    const antes = { ...planDe(vehiculo.id) };

    await vehiculoService.actualizarVehiculo(vehiculo.id, datosEdicion(vehiculo, { numeroInterno: '99' }));

    assert.deepEqual(planDe(vehiculo.id), antes);
    assert.equal(db.vehiculos[0].numeroInterno, '99');
  });
});
