process.env.JWT_SECRET = 'secreto-solo-para-tests';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

const { crearEntorno, instalarEnCache } = require('./helpers/prismaFalsoConEstado');

const { prisma: prismaFalso, db, sembrar } = crearEntorno();

instalarEnCache(SRC, prismaFalso);

const app = require(path.join(SRC, 'app.js'));
const { generarToken } = require(path.join(SRC, 'services', 'tokenService.js'));

let servidor;
let base;

before(async () => {
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/mantenimientos`;
});

after(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  sembrar();
});

function tokenDe(perfil) {
  return generarToken({ id: 10, nombreUsuario: `test-${perfil}`, perfil, habilitadoParaConducir: true });
}

describe('Módulo de Mantenimiento - Plantillas fijas', () => {
  test('GET /plantillas devuelve las 4 plantillas fijas en orden', async () => {
    const res = await fetch(`${base}/plantillas`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.plantillas));
    assert.equal(body.plantillas.length, 4);

    const nombres = body.plantillas.map((p) => p.nombre);
    assert.ok(nombres[0].includes('Colectivo'));
    assert.equal(body.plantillas[0].intervaloKm, 20000);
    assert.equal(body.plantillas[1].intervaloKm, 20000); // Minibus
    assert.equal(body.plantillas[2].intervaloKm, 15000); // Trafic
    assert.equal(body.plantillas[3].intervaloKm, 10000); // Utilitario
  });

  test('PERSONAL_TALLER y ENCARGADO pueden ver plantillas, CHOFER recibe 403', async () => {
    const resTaller = await fetch(`${base}/plantillas`, {
      headers: { Authorization: `Bearer ${tokenDe('PERSONAL_TALLER')}` },
    });
    assert.equal(resTaller.status, 200);

    const resChofer = await fetch(`${base}/plantillas`, {
      headers: { Authorization: `Bearer ${tokenDe('CHOFER')}` },
    });
    assert.equal(resChofer.status, 403);
  });
});

describe('Módulo de Mantenimiento - Asignación de Plan a Vehículo (SCRUM-15)', () => {
  test('Asigna automáticamente la plantilla de su tipo de vehículo y calcula próximo service', async () => {
    // Vehículo 7 es Colectivo (intervalo 20.000 km) y tiene odómetro en 1.000 km
    const res = await fetch(`${base}/planes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDe('PERSONAL_TALLER')}`,
      },
      body: JSON.stringify({
        vehiculoId: 7,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.plan);
    assert.equal(body.plan.vehiculoId, 7);
    assert.equal(body.plan.kmUltimoService, 1000);
    assert.equal(body.plan.kmProximoService, 21000);
    assert.equal(body.plan.kmRestantes, 20000);
    assert.equal(body.plan.estadoMantenimiento, 'AL_DIA');
  });

  test('Permite indicar un kilometraje de último service manual anterior', async () => {
    const res = await fetch(`${base}/planes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDe('ENCARGADO')}`,
      },
      body: JSON.stringify({
        vehiculoId: 7,
        kmUltimoService: 500,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.plan.kmUltimoService, 500);
    assert.equal(body.plan.kmProximoService, 20500);
  });

  test('Valida que el vehículo exista', async () => {
    const res = await fetch(`${base}/planes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}`,
      },
      body: JSON.stringify({
        vehiculoId: 9999,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errores.vehiculoId);
  });
});

describe('Módulo de Mantenimiento - Alertas y Estados (SCRUM-36 / SCRUM-144)', () => {
  test('Clasifica correctamente en AL_DIA, PROXIMO y VENCIDO según km', async () => {
    // 1. Plan al día: odómetro 1.000, próximo 21.000
    await fetch(`${base}/planes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
      body: JSON.stringify({ vehiculoId: 7, kmUltimoService: 1000 }),
    });

    let res = await fetch(`${base}/planes`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    let planes = (await res.json()).planes;
    assert.equal(planes[0].estadoMantenimiento, 'AL_DIA');

    // 2. Cambiar odómetro a 20.200 (faltan 800 km <= umbral 1000 km) -> PROXIMO
    const v7 = db.vehiculos.find((v) => v.id === 7);
    v7.kilometraje = 20200;

    res = await fetch(`${base}/planes`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    planes = (await res.json()).planes;
    assert.equal(planes[0].estadoMantenimiento, 'PROXIMO');
    assert.equal(planes[0].kmRestantes, 800);

    // 3. Cambiar odómetro a 21.050 (superó los 21.000) -> VENCIDO
    v7.kilometraje = 21050;
    res = await fetch(`${base}/planes`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    planes = (await res.json()).planes;
    assert.equal(planes[0].estadoMantenimiento, 'VENCIDO');
    assert.equal(planes[0].kmExcedidos, 50);

    // 4. Filtro soloAlertas=true trae únicamente los que requieren atención
    res = await fetch(`${base}/planes?soloAlertas=true`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    const alertas = (await res.json()).planes;
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].vehiculoId, 7);
  });
});

describe('Módulo de Mantenimiento - Registro de Intervenciones y Ficha Médica (SCRUM-34 y SCRUM-17)', () => {
  test('Service preventivo reinicia contador del plan y actualiza odómetro', async () => {
    // Asignar plan a vehículo 7 (odómetro 1.000, próximo 21.000)
    await fetch(`${base}/planes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
      body: JSON.stringify({ vehiculoId: 7 }),
    });

    // Registrar service realizado a los 21.100 km
    const res = await fetch(`${base}/realizados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('PERSONAL_TALLER')}` },
      body: JSON.stringify({
        vehiculoId: 7,
        categoria: 'SERVICE_PREVENTIVO',
        esServicePreventivo: true,
        kilometraje: 21100,
        descripcion: 'Cambio de aceite, filtros de aire y combustible, revisión de frenos',
        tallerMecanico: 'Taller Central Adri-Mar',
        costo: 185000,
      }),
    });
    assert.equal(res.status, 201);
    const { mantenimiento } = await res.json();
    assert.ok(mantenimiento);
    assert.equal(mantenimiento.kilometraje, 21100);
    assert.equal(mantenimiento.esServicePreventivo, true);

    // Verificar que el plan se haya actualizado (+20.000 km desde 21.100 -> próximo 41.100 km)
    const plan = db.planesMantenimiento.find((p) => p.vehiculoId === 7);
    assert.equal(plan.kmUltimoService, 21100);
    assert.equal(plan.kmProximoService, 41100);

    // Verificar que el vehículo haya calibrado su odómetro a 21.100 km
    const vehiculo = db.vehiculos.find((v) => v.id === 7);
    assert.equal(vehiculo.kilometraje, 21100);
  });

  test('Mantenimiento particular (cubiertas) se guarda en historial SIN alterar el plan preventivo', async () => {
    // Asignar plan a vehículo 7
    await fetch(`${base}/planes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
      body: JSON.stringify({ vehiculoId: 7, kmUltimoService: 1000 }),
    });

    const res = await fetch(`${base}/realizados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('PERSONAL_TALLER')}` },
      body: JSON.stringify({
        vehiculoId: 7,
        categoria: 'CUBIERTAS',
        esServicePreventivo: false,
        kilometraje: 15000,
        descripcion: 'Rotación y cambio de 2 cubiertas delanteras Fatecargo',
        repuestos: '2 cubiertas Fatecargo 295/80 R22.5',
        tallerMecanico: 'Gomería Río Tercero',
        costo: 350000,
      }),
    });
    assert.equal(res.status, 201);

    // El plan preventivo sigue intacto a los 21.000 km
    const plan = db.planesMantenimiento.find((p) => p.vehiculoId === 7);
    assert.equal(plan.kmUltimoService, 1000);
    assert.equal(plan.kmProximoService, 21000);

    // Consultar historial del vehículo
    const resHistorial = await fetch(`${base}/vehiculos/7/historial`, {
      headers: { Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
    });
    assert.equal(resHistorial.status, 200);
    const bodyHistorial = await resHistorial.json();
    assert.equal(bodyHistorial.totalIntervenciones, 1);
    assert.equal(bodyHistorial.historial[0].categoria, 'CUBIERTAS');
    assert.equal(bodyHistorial.historial[0].costo, 350000);
  });
});

describe('Módulo de Mantenimiento - Advertencia en Planificación de Viajes (SCRUM-228)', () => {
  test('Avisa si los km estimados del viaje harán que el vehículo supere el próximo service', async () => {
    // Plan con próximo service en 21.000 km, odómetro actual en 20.000 km (faltan 1.000 km)
    await fetch(`${base}/planes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDe('ADMINISTRADOR')}` },
      body: JSON.stringify({ vehiculoId: 7, kmUltimoService: 1000 }),
    });
    const v7 = db.vehiculos.find((v) => v.id === 7);
    v7.kilometraje = 20000;

    // Viaje de 500 km -> alcanza 20.500 km < 21.000 km -> No advierte
    let res = await fetch(`${base}/evaluar-viaje?vehiculoId=7&kilometrosEstimados=500`, {
      headers: { Authorization: `Bearer ${tokenDe('ENCARGADO')}` },
    });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.advertencia.tieneAdvertencia, false);

    // Viaje de 1.200 km -> alcanza 21.200 km >= 21.000 km -> Sí advierte
    res = await fetch(`${base}/evaluar-viaje?vehiculoId=7&kilometrosEstimados=1200`, {
      headers: { Authorization: `Bearer ${tokenDe('ENCARGADO')}` },
    });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.advertencia.tieneAdvertencia, true);
    assert.equal(body.advertencia.superaEnViaje, true);
    assert.equal(body.advertencia.kmFinalEstimado, 21200);
    assert.ok(body.advertencia.mensaje.includes('superará'));

    // Si el vehículo ya está vencido de antes (ej: 21.500 km) -> Sí advierte como ya vencido
    v7.kilometraje = 21500;
    res = await fetch(`${base}/evaluar-viaje?vehiculoId=7&kilometrosEstimados=200`, {
      headers: { Authorization: `Bearer ${tokenDe('ENCARGADO')}` },
    });
    body = await res.json();
    assert.equal(body.advertencia.tieneAdvertencia, true);
    assert.equal(body.advertencia.yaVencido, true);
    assert.ok(body.advertencia.mensaje.includes('ya superó'));
  });
});
