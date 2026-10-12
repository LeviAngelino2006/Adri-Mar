// Tests de los helpers de presupuestos. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaVencimiento,
  formatearFechaDocumento,
  formatearFechaPresupuesto,
  nombreArchivoPresupuesto,
  opcionUnidad,
  textoHorario,
  errorImporteIngresado,
  valoresAPayload,
  valoresDuplicado,
  valoresNuevoPresupuesto,
} from './presupuestos.js';

// 12/10/2026 a las 23:30 en Córdoba: en UTC ya es el 13.
const AHORA_NOCHE = Date.parse('2026-10-13T02:30:00Z');

const PRESUPUESTO = {
  id: 7,
  fechaEmision: '2026-09-01',
  cliente: { id: 48, nombre: 'Club Acción Juvenil' },
  origen: { id: 175, nombre: 'Río Tercero' },
  destino: { id: 176, nombre: 'General Deheza' },
  fechaServicio: '2026-11-05',
  horaSalida: null,
  cantidadPasajeros: 30,
  importeNeto: '1234.50',
  conFactura: true,
  alicuotaIva: '10.50',
  formaPago: 'EFECTIVO',
  diasValidez: 20,
  unidades: [
    { vehiculoId: 88, descripcion: 'Minibus de 17 pasajeros', orden: 1 },
    { vehiculoId: 87, descripcion: 'Colectivo de 40 pasajeros', orden: 2 },
  ],
};

describe('fechas', () => {
  test('formato de la app y del documento, sin corrimiento de día', () => {
    assert.equal(formatearFechaPresupuesto('2026-10-12'), '12 oct 2026');
    assert.equal(formatearFechaDocumento('2026-10-12'), '12/10/2026');
    assert.equal(formatearFechaPresupuesto('2027-01-01'), '01 ene 2027');
  });

  test('vencimiento = emisión + días, cruzando mes y año', () => {
    assert.equal(fechaVencimiento('2026-10-12', 15), '2026-10-27');
    assert.equal(fechaVencimiento('2026-10-12', '30'), '2026-11-11');
    assert.equal(fechaVencimiento('2026-12-20', 15), '2027-01-04');
  });

  test('sin vencimiento si los días no son válidos o falta la fecha', () => {
    for (const dias of ['', '0', '366', '1.5', '-3', 'abc']) {
      assert.equal(fechaVencimiento('2026-10-12', dias), null, `días ${dias}`);
    }
    assert.equal(fechaVencimiento('', 15), null);
  });
});

test('horario vacío → "A confirmar"', () => {
  assert.equal(textoHorario(null), 'A confirmar');
  assert.equal(textoHorario('07:30'), '07:30');
});

test('opción de unidad: interno · dominio y el texto del PDF', () => {
  assert.deepEqual(
    opcionUnidad({ id: 88, numeroInterno: '2', dominio: 'AB456CD', asientos: 17, tipoVehiculo: { descripcion: 'Minibus' } }),
    { id: 88, etiqueta: '2 · AB456CD', detalle: 'Minibus de 17 pasajeros' }
  );
});

describe('nombreArchivoPresupuesto', () => {
  test('cliente y fecha de emisión dd-mm-aaaa, con tildes', () => {
    assert.equal(nombreArchivoPresupuesto(PRESUPUESTO), 'Presupuesto - Club Acción Juvenil - 01-09-2026.pdf');
  });

  test('saca caracteres inválidos y puntos del final', () => {
    const conRaros = { ...PRESUPUESTO, cliente: { nombre: 'Escuela N°3 "San/Martín": 5to año*  S.A.' } };
    assert.equal(
      nombreArchivoPresupuesto(conRaros),
      'Presupuesto - Escuela N°3 San Martín 5to año S.A - 01-09-2026.pdf'
    );
  });
});

describe('valores del formulario', () => {
  test('nuevo: emisión de hoy en Córdoba (aunque en UTC ya sea mañana), validez 15 y forma de pago por defecto', () => {
    const valores = valoresNuevoPresupuesto(AHORA_NOCHE);
    assert.equal(valores.fechaEmision, '2026-10-12');
    assert.equal(valores.diasValidez, '15');
    assert.equal(valores.formaPago, 'EFECTIVO / TRANSFERENCIA BANCARIA Y/O VALORES A 30 Y 60 DÍAS');
    assert.equal(valores.conFactura, false);
  });

  test('duplicar: todo igual al original salvo la emisión, que es hoy', () => {
    const valores = valoresDuplicado(PRESUPUESTO, AHORA_NOCHE);
    assert.equal(valores.fechaEmision, '2026-10-12');
    assert.deepEqual(valores.vehiculoIds, [88, 87]);
    assert.equal(valores.importeNeto, '1.234,5');
    assert.equal(valores.horaSalida, '');
    assert.equal(valores.diasValidez, '20');
    assert.equal(valores.clienteNombre, 'Club Acción Juvenil');
    assert.equal(valores.fechaServicio, '2026-11-05');
  });

  test('payload: el importe en formato argentino viaja como "420000.50"', () => {
    const form = { ...valoresNuevoPresupuesto(AHORA_NOCHE), importeNeto: '420.000,5' };
    assert.equal(valoresAPayload(form).importeNeto, '420000.50');
  });

  test('error local del importe: inválido sí, vacío o válido no', () => {
    assert.ok(errorImporteIngresado('420.00'));
    assert.ok(errorImporteIngresado('42.0000'));
    assert.equal(errorImporteIngresado(''), null);
    assert.equal(errorImporteIngresado('420.000,50'), null);
    assert.equal(errorImporteIngresado('420000'), null);
  });

  test('payload: el importe viaja con punto y 2 decimales', () => {
    const payload = valoresAPayload(valoresDuplicado(PRESUPUESTO, AHORA_NOCHE));
    assert.equal(payload.importeNeto, '1234.50');
    assert.ok(!('clienteNombre' in payload));
  });
});
