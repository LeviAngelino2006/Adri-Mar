// Tests de los valores iniciales del formulario de viaje al duplicar: qué se
// copia del original y qué queda vacío. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDuplicado, valoresParaDuplicar, viajeAValoresForm } from './valoresFormViaje.js';

const ubicacion = (id, nombre, extra = {}) => ({ id, nombre, placeId: null, latitud: null, longitud: null, ...extra });

// Un viaje Finalizado completo, como lo devuelve la API a un Administrador:
// con candidatos (vacíos fuera de A_CONFIRMAR, acá cargados para probar que no
// se copian), asignación, datos administrativos y datos de la ejecución.
// Hora de Córdoba = UTC - 3.
const viajeCompleto = (extra = {}) => ({
  id: 7,
  estado: 'FINALIZADO',
  clienteId: 3,
  cliente: { id: 3, nombre: 'Colegio San José' },
  origenId: 10,
  origen: ubicacion(10, 'Río Tercero', { placeId: 'ChIJ-rio3', latitud: -32.17, longitud: -64.11 }),
  destinoId: 20,
  destino: ubicacion(20, 'Córdoba', { placeId: 'ChIJ-cba', latitud: -31.42, longitud: -64.18 }),
  // La API las manda ordenadas por `orden`.
  paradas: [
    { orden: 1, ubicacion: ubicacion(31, 'Almafuerte') },
    { orden: 2, ubicacion: ubicacion(32, 'Despeñaderos') },
  ],
  fechaInicio: '2026-10-09T10:30:00.000Z',
  fechaFin: '2026-10-09T21:00:00.000Z',
  kilometrosEstimados: 130,
  cantidadPasajeros: 45,
  choferId: 115,
  chofer: { id: 115, nombre: 'Martín', apellido: 'Gómez', telefono: '3571555555' },
  vehiculoId: 4,
  vehiculo: { id: 4, dominio: 'AE452KD', numeroInterno: 12 },
  choferesCandidatos: [{ id: 115, nombre: 'Martín', apellido: 'Gómez' }, { id: 116, nombre: 'Ana', apellido: 'Pérez' }],
  vehiculosCandidatos: [{ id: 4, dominio: 'AE452KD', numeroInterno: 12 }],
  precio: '420000.00',
  estadoPagoClienteId: 2,
  estadoPagoCliente: { id: 2, descripcion: 'PAGADO' },
  fechaPagoCliente: '2026-10-10T15:00:00.000Z',
  metodoPagoClienteId: 1,
  metodoPagoCliente: { id: 1, descripcion: 'TRANSFERENCIA' },
  pagoChofer: '60000.00',
  estadoPagoChoferId: 2,
  estadoPagoChofer: { id: 2, descripcion: 'PAGADO' },
  fechaPagoChofer: '2026-10-11T15:00:00.000Z',
  metodoPagoChoferId: 2,
  metodoPagoChofer: { id: 2, descripcion: 'EFECTIVO' },
  pendienteAdministrativo: null,
  horaInicioReal: '2026-10-09T10:40:00.000Z',
  horaFinReal: '2026-10-09T21:15:00.000Z',
  odometroInicial: 152000,
  odometroFinal: 152290,
  kmRealizados: 290,
  observacionFinal: 'Se demoró la vuelta por lluvia',
  creadoEn: '2026-10-01T12:00:00.000Z',
  ...extra,
});

// Las claves de FORM_INICIAL (ViajeForm.jsx): lo único que el formulario
// manda en el POST del alta.
const CLAVES_FORM = [
  'clienteId',
  'clienteNombre',
  'choferId',
  'vehiculoId',
  'choferesCandidatos',
  'vehiculosCandidatos',
  'paradas',
  'origenId',
  'origenNombre',
  'destinoId',
  'destinoNombre',
  'origenLugar',
  'destinoLugar',
  'fechaInicio',
  'fechaFin',
  'kilometrosEstimados',
  'cantidadPasajeros',
];

describe('valoresParaDuplicar: lo que se copia', () => {
  const valores = valoresParaDuplicar(viajeCompleto());

  test('cliente', () => {
    assert.equal(valores.clienteId, 3);
    assert.equal(valores.clienteNombre, 'Colegio San José');
  });

  test('origen y destino, con su lugar en el mapa', () => {
    assert.equal(valores.origenId, 10);
    assert.equal(valores.origenNombre, 'Río Tercero');
    assert.deepEqual(valores.origenLugar, { placeId: 'ChIJ-rio3', latitud: -32.17, longitud: -64.11 });
    assert.equal(valores.destinoId, 20);
    assert.equal(valores.destinoNombre, 'Córdoba');
    assert.deepEqual(valores.destinoLugar, { placeId: 'ChIJ-cba', latitud: -31.42, longitud: -64.18 });
  });

  test('paradas en el mismo orden, como filas nuevas del formulario', () => {
    assert.deepEqual(
      valores.paradas.map((p) => [p.id, p.nombre]),
      [
        [31, 'Almafuerte'],
        [32, 'Despeñaderos'],
      ]
    );
    // Cada fila con su propia clave (la `key` de React del editor de recorrido).
    assert.equal(new Set(valores.paradas.map((p) => p.clave)).size, 2);
  });

  test('las paradas respetan el orden en que vienen aunque los ids no estén ordenados', () => {
    const viaje = viajeCompleto({
      paradas: [
        { orden: 1, ubicacion: ubicacion(40, 'Embalse') },
        { orden: 2, ubicacion: ubicacion(12, 'Almafuerte') },
        { orden: 3, ubicacion: ubicacion(40, 'Embalse') },
      ],
    });
    assert.deepEqual(
      valoresParaDuplicar(viaje).paradas.map((p) => p.id),
      [40, 12, 40]
    );
  });

  test('fecha y hora de inicio y de fin, en hora de Córdoba para el datetime-local', () => {
    assert.equal(valores.fechaInicio, '2026-10-09T07:30');
    assert.equal(valores.fechaFin, '2026-10-09T18:00');
  });

  test('kilómetros estimados (solo el número: el resultado de "Calcular km" no viaja)', () => {
    assert.equal(valores.kilometrosEstimados, 130);
  });
});

describe('valoresParaDuplicar: lo que NO se copia', () => {
  const valores = valoresParaDuplicar(viajeCompleto());

  test('cantidad de pasajeros queda vacía', () => {
    assert.equal(valores.cantidadPasajeros, '');
  });

  test('choferes posibles quedan vacíos', () => {
    assert.deepEqual(valores.choferesCandidatos, []);
  });

  test('vehículos posibles quedan vacíos', () => {
    assert.deepEqual(valores.vehiculosCandidatos, []);
  });

  test('chofer asignado queda vacío', () => {
    assert.equal(valores.choferId, '');
  });

  test('vehículo asignado queda vacío', () => {
    assert.equal(valores.vehiculoId, '');
  });

  test('precio', () => {
    assert.ok(!('precio' in valores));
  });

  test('datos administrativos y de pago (cliente y chofer)', () => {
    for (const campo of [
      'pagoChofer',
      'estadoPagoClienteId',
      'estadoPagoCliente',
      'fechaPagoCliente',
      'metodoPagoClienteId',
      'metodoPagoCliente',
      'estadoPagoChoferId',
      'estadoPagoChofer',
      'fechaPagoChofer',
      'metodoPagoChoferId',
      'metodoPagoChofer',
      'pendienteAdministrativo',
      'datosAdministrativos',
    ]) {
      assert.ok(!(campo in valores), `no debería copiarse ${campo}`);
    }
  });

  test('estado (el nuevo nace A_CONFIRMAR en el backend)', () => {
    assert.ok(!('estado' in valores));
    assert.ok(!('estadoViajeId' in valores));
  });

  test('odómetros y km realizados', () => {
    for (const campo of ['odometroInicial', 'odometroFinal', 'kmRealizados']) {
      assert.ok(!(campo in valores), `no debería copiarse ${campo}`);
    }
  });

  test('horas reales', () => {
    assert.ok(!('horaInicioReal' in valores));
    assert.ok(!('horaFinReal' in valores));
  });

  test('observación final', () => {
    assert.ok(!('observacionFinal' in valores));
  });

  test('ni el id ni nada fuera de los campos del formulario', () => {
    assert.ok(!('id' in valores));
    assert.deepEqual(Object.keys(valores).sort(), [...CLAVES_FORM].sort());
  });
});

describe('valoresParaDuplicar: casos borde', () => {
  test('el original no se modifica', () => {
    const original = viajeCompleto();
    const copia = structuredClone(original);
    valoresParaDuplicar(original);
    assert.deepEqual(original, copia);
  });

  test('un A confirmar sin asignación ni pasajeros da lo mismo que uno completo', () => {
    const aConfirmar = viajeCompleto({
      estado: 'A_CONFIRMAR',
      choferId: null,
      chofer: null,
      vehiculoId: null,
      vehiculo: null,
      cantidadPasajeros: null,
    });
    const { paradas: p1, ...resto1 } = valoresParaDuplicar(aConfirmar);
    const { paradas: p2, ...resto2 } = valoresParaDuplicar(viajeCompleto());
    assert.deepEqual(resto1, resto2);
    assert.deepEqual(p1.map((p) => p.id), p2.map((p) => p.id));
  });

  test('un viaje histórico sin cliente, origen, destino ni km da esos campos vacíos', () => {
    const valores = valoresParaDuplicar(
      viajeCompleto({ clienteId: null, cliente: null, origenId: null, origen: null, destinoId: null, destino: null, paradas: [], kilometrosEstimados: null, fechaFin: null })
    );
    assert.equal(valores.clienteId, '');
    assert.equal(valores.origenId, '');
    assert.equal(valores.destinoNombre, '');
    assert.deepEqual(valores.paradas, []);
    assert.equal(valores.kilometrosEstimados, '');
    assert.equal(valores.fechaFin, '');
  });

  test('editar sigue copiando todo, incluida la asignación y los pasajeros', () => {
    const valores = viajeAValoresForm(viajeCompleto());
    assert.equal(valores.cantidadPasajeros, 45);
    assert.equal(valores.choferId, 115);
    assert.equal(valores.vehiculoId, 4);
    assert.deepEqual(valores.choferesCandidatos, [115, 116]);
    assert.deepEqual(valores.vehiculosCandidatos, [4]);
  });
});

describe('avisoDuplicado', () => {
  test('con fecha (día de Córdoba) y destino', () => {
    assert.equal(
      avisoDuplicado(viajeCompleto()),
      'Duplicado del viaje del 09 oct 2026 a Córdoba. Revisá fecha, pasajeros y unidad antes de crear.'
    );
  });

  test('la fecha es la de Córdoba aunque en UTC ya sea el día siguiente', () => {
    assert.match(avisoDuplicado(viajeCompleto({ fechaInicio: '2026-10-10T01:30:00.000Z' })), /del 09 oct 2026 a/);
  });

  test('un viaje histórico sin fecha ni destino', () => {
    assert.equal(
      avisoDuplicado(viajeCompleto({ fechaInicio: null, destino: null, destinoId: null })),
      'Duplicado del viaje. Revisá fecha, pasajeros y unidad antes de crear.'
    );
  });
});
