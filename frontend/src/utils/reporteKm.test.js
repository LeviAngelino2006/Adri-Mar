import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularEscalaEjeY,
  detectarPresetPeriodo,
  etiquetaPuntoSerie,
  filtrarVehiculosReporte,
  formatearDesvio,
  formatearRangoPeriodo,
  nombreArchivoReportePdf,
  ordenarVehiculosReporte,
  partirTokenPdf,
  rangoMesActual,
  rangoSemanaActual,
  rangoSemanaAnterior,
  tituloPuntoSerie,
  validarRangoPeriodo,
} from './reporteKm.js';

describe('reporteKm — períodos en hora de Córdoba', () => {
  test('rangoSemanaActual calcula lunes a domingo aun en el borde nocturno UTC', () => {
    // 2026-11-23T01:30:00Z = domingo 22 nov 2026 22:30 ART
    const domingoNocheArt = Date.parse('2026-11-23T01:30:00Z');
    assert.deepEqual(rangoSemanaActual(domingoNocheArt), { desde: '2026-11-16', hasta: '2026-11-22' });

    // 2026-11-23T03:00:00Z = lunes 23 nov 2026 00:00 ART
    const lunesCeroArt = Date.parse('2026-11-23T03:00:00Z');
    assert.deepEqual(rangoSemanaActual(lunesCeroArt), { desde: '2026-11-23', hasta: '2026-11-29' });
  });

  test('rangoSemanaAnterior y rangoMesActual manejan cambio de año y bisiestos', () => {
    // Viernes 02 ene 2026 12:00 ART -> semana anterior cruza 2025
    const dosEnero = Date.parse('2026-01-02T15:00:00Z');
    assert.deepEqual(rangoSemanaActual(dosEnero), { desde: '2025-12-29', hasta: '2026-01-04' });
    assert.deepEqual(rangoSemanaAnterior(dosEnero), { desde: '2025-12-22', hasta: '2025-12-28' });

    // Febrero en año bisiesto (2024) y no bisiesto (2026)
    assert.deepEqual(rangoMesActual(Date.parse('2024-02-15T15:00:00Z')), {
      desde: '2024-02-01',
      hasta: '2024-02-29',
    });
    assert.deepEqual(rangoMesActual(Date.parse('2026-02-15T15:00:00Z')), {
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  test('detectarPresetPeriodo identifica el preset correspondiente', () => {
    const ahora = Date.parse('2026-11-21T15:00:00Z');
    assert.equal(detectarPresetPeriodo('2026-11-16', '2026-11-22', ahora), 'semana_actual');
    assert.equal(detectarPresetPeriodo('2026-11-09', '2026-11-15', ahora), 'semana_anterior');
    assert.equal(detectarPresetPeriodo('2026-11-01', '2026-11-30', ahora), 'mes_actual');
    assert.equal(detectarPresetPeriodo('2026-11-01', '2026-11-10', ahora), 'personalizado');
  });

  test('validarRangoPeriodo detecta fechas faltantes, invertidas y > 366 días', () => {
    assert.equal(validarRangoPeriodo('', '2026-11-22'), 'Elegí fecha desde y hasta.');
    assert.equal(validarRangoPeriodo('2026-02-30', '2026-03-01'), 'Elegí fecha desde y hasta.');
    assert.equal(validarRangoPeriodo('2026-11-22', '2026-11-16'), 'La fecha hasta no puede ser anterior a desde.');
    assert.equal(validarRangoPeriodo('2025-01-01', '2026-01-02'), 'El período no puede superar los 366 días.');
    assert.equal(validarRangoPeriodo('2026-11-16', '2026-11-22'), '');
  });

  test('formatearRangoPeriodo usa formato corto de Córdoba y nunca dd/mm/aaaa', () => {
    assert.equal(formatearRangoPeriodo('2026-11-16', '2026-11-22'), '16 nov 2026 – 22 nov 2026');
    assert.equal(formatearRangoPeriodo('2026-11-16', '2026-11-16'), '16 nov 2026');
  });

  test('formatearDesvio muestra signo, porcentaje y kilómetros o No registrado', () => {
    assert.equal(formatearDesvio(null, null), 'No registrado');
    assert.equal(formatearDesvio(3.9, 180), '+3,9 % (+180 km)');
    assert.equal(formatearDesvio(-10, -20), '-10 % (-20 km)');
    assert.equal(formatearDesvio(0, 0), '0 % (0 km)');
  });
});

describe('reporteKm — filtros, orden y formato', () => {
  const ITEMS = [
    {
      vehiculo: { id: 1, numeroInterno: '12', dominio: 'AE452KD', marca: 'Mercedes-Benz', modelo: 'O500', tipoVehiculoId: 1, tipoVehiculo: 'Colectivo', estado: 'OPERATIVO', kilometraje: 120000 },
      kmRecorridos: 800,
      cantidadViajes: 3,
      promedioKmPorViaje: 267,
      porcentajeKmTotal: 80,
      desvioKm: 40,
      desvioPorcentaje: 5.3,
    },
    {
      vehiculo: { id: 2, numeroInterno: '2', dominio: 'AA111BB', marca: 'Iveco', modelo: 'Daily', tipoVehiculoId: 2, tipoVehiculo: 'Minibús', estado: 'EN_TALLER', kilometraje: 50000 },
      kmRecorridos: 200,
      cantidadViajes: 4,
      promedioKmPorViaje: 50,
      porcentajeKmTotal: 20,
      desvioKm: -10,
      desvioPorcentaje: -4.8,
    },
    {
      vehiculo: { id: 3, numeroInterno: '5', dominio: 'AB222CC', marca: 'Renault', modelo: 'Master', tipoVehiculoId: 3, tipoVehiculo: 'Combi', estado: 'OPERATIVO', kilometraje: 30000 },
      kmRecorridos: 0,
      cantidadViajes: 0,
      promedioKmPorViaje: null,
      porcentajeKmTotal: 0,
      desvioKm: null,
      desvioPorcentaje: null,
    },
  ];

  test('filtra por texto, tipo y toggle de vehículos sin viajes', () => {
    assert.equal(filtrarVehiculosReporte(ITEMS, { incluirSinViajes: false }).length, 2);
    assert.equal(filtrarVehiculosReporte(ITEMS, { busqueda: 'ae452', incluirSinViajes: true }).length, 1);
    assert.equal(filtrarVehiculosReporte(ITEMS, { tipoVehiculoId: '2' })[0].vehiculo.id, 2);
  });

  test('ordena por km, viajes, interno natural y desvío', () => {
    assert.deepEqual(
      ordenarVehiculosReporte(ITEMS, 'km_desc').map((i) => i.vehiculo.id),
      [1, 2, 3]
    );
    assert.deepEqual(
      ordenarVehiculosReporte(ITEMS, 'viajes_desc').map((i) => i.vehiculo.id),
      [2, 1, 3]
    );
    assert.deepEqual(
      ordenarVehiculosReporte(ITEMS, 'interno_asc').map((i) => i.vehiculo.id),
      [2, 3, 1]
    );
    assert.deepEqual(
      ordenarVehiculosReporte(ITEMS, 'desvio_desc').map((i) => i.vehiculo.id),
      [1, 2, 3]
    );
  });

  test('genera el nombre de archivo PDF del período', () => {
    assert.equal(nombreArchivoReportePdf('2026-11-16', '2026-11-22'), 'Reporte km por vehiculo - 2026-11-16 a 2026-11-22.pdf');
  });

  test('etiquetaPuntoSerie y tituloPuntoSerie formatean día, semana y mes en hora de Córdoba', () => {
    const puntoDia = { clave: '2026-11-16', desde: '2026-11-16', hasta: '2026-11-16' };
    assert.equal(etiquetaPuntoSerie(puntoDia, 'dia', 7), 'lun 16');
    assert.equal(etiquetaPuntoSerie(puntoDia, 'dia', 30), '16 nov');
    assert.equal(tituloPuntoSerie(puntoDia, 'dia'), '16 nov 2026');

    const puntoSemana = { clave: '2026-11-16', desde: '2026-11-16', hasta: '2026-11-22' };
    assert.equal(etiquetaPuntoSerie(puntoSemana, 'semana', 9), '16 nov');
    assert.equal(tituloPuntoSerie(puntoSemana, 'semana'), '16 nov 2026 – 22 nov 2026');

    const puntoMes = { clave: '2026-11', desde: '2026-11-01', hasta: '2026-11-30' };
    assert.equal(etiquetaPuntoSerie(puntoMes, 'mes', 8), 'nov 26');
    assert.equal(tituloPuntoSerie(puntoMes, 'mes'), 'Noviembre 2026');
  });

  test('partirTokenPdf divide tokens largos por guion/barra o longitud e intercala separadores sin guiones extra', () => {
    assert.deepEqual(partirTokenPdf('14', 9), ['14']);
    assert.deepEqual(partirTokenPdf('registrado', 10), ['registrado']);
    assert.deepEqual(partirTokenPdf('E2E8A1-1795221084123', 9), ['E2E8A1-', '', '179522108', '', '4123']);
    assert.deepEqual(partirTokenPdf('3478951234567890', 9), ['347895123', '', '4567890']);
  });

  test('calcularEscalaEjeY genera marcas redondeadas en 0, pequeños enteros y múltiplos de km', () => {
    assert.deepEqual(calcularEscalaEjeY(0), { techo: 1, marcas: [1, 0] });
    assert.deepEqual(calcularEscalaEjeY(1), { techo: 1, marcas: [1, 0] });
    assert.deepEqual(calcularEscalaEjeY(2), { techo: 2, marcas: [2, 1, 0] });
    assert.deepEqual(calcularEscalaEjeY(3), { techo: 3, marcas: [3, 2, 1, 0] });
    assert.deepEqual(calcularEscalaEjeY(5), { techo: 6, marcas: [6, 4, 2, 0] });
    assert.deepEqual(calcularEscalaEjeY(145), { techo: 150, marcas: [150, 100, 50, 0] });
    assert.deepEqual(calcularEscalaEjeY(720), { techo: 750, marcas: [750, 500, 250, 0] });
    assert.deepEqual(calcularEscalaEjeY(865), { techo: 900, marcas: [900, 600, 300, 0] });
    assert.deepEqual(calcularEscalaEjeY(1400), { techo: 1500, marcas: [1500, 1000, 500, 0] });
    assert.deepEqual(calcularEscalaEjeY(2800), { techo: 3000, marcas: [3000, 2000, 1000, 0] });
  });
});
