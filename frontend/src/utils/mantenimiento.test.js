// Tests de las funciones puras de la pantalla de Mantenimiento: filtro y orden
// de la pestaña Service, textos de las tarjetas y validación de los
// formularios. Se corren con `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  contarAlertas,
  detalleEstadoService,
  filtrarEstadoService,
  nombreTipoArreglo,
  ordenarEstadoService,
  textoAdvertenciaViaje,
  textoIncluyeService,
  textoIntervalo,
  textoRegistro,
  textoTiposArreglo,
  textoTrabajos,
  validarRegistroMantenimiento,
  esKmAnterior,
} from './mantenimiento.js';
import { TAREAS_SERVICE } from '../constants/mantenimiento.js';

// Un ítem como los de GET /mantenimientos/planes.
function item(id, numeroInterno, estado, extra = {}) {
  const { tipoVehiculoId = 1, tipoVehiculo = 'Colectivo', intervaloKm = 20000, ...resto } = extra;
  return {
    vehiculo: {
      id,
      numeroInterno,
      dominio: `AA${id}00BB`,
      marca: 'Mercedes-Benz',
      modelo: 'O500',
      kilometraje: 50000,
      tipoVehiculoId,
      tipoVehiculo,
    },
    plantilla: { intervaloKm, porcentajeAviso: 95 },
    plan: estado === 'SIN_PLAN' ? null : { kmUltimoService: 40000 },
    estado,
    porcentajeConsumido: estado === 'SIN_PLAN' ? null : 0,
    kmDesdeService: estado === 'SIN_PLAN' ? null : 0,
    ...resto,
  };
}

describe('filtrarEstadoService', () => {
  const items = [
    item(1, '2', 'VENCIDO'),
    item(2, '10', 'AL_DIA', { tipoVehiculoId: 3, tipoVehiculo: 'Trafic' }),
    item(3, '12', 'SIN_PLAN'),
  ];

  test('busca por interno, dominio, marca o modelo, sin tildes ni mayúsculas', () => {
    assert.deepEqual(filtrarEstadoService(items, { busqueda: '12' }).map((i) => i.vehiculo.id), [3]);
    assert.deepEqual(filtrarEstadoService(items, { busqueda: 'aa300' }).map((i) => i.vehiculo.id), [3]);
    assert.equal(filtrarEstadoService(items, { busqueda: 'MERCEDES' }).length, 3);
    assert.equal(filtrarEstadoService(items, { busqueda: 'o500' }).length, 3);
  });

  test('filtra por estado y por tipo de vehículo', () => {
    assert.deepEqual(filtrarEstadoService(items, { estado: 'SIN_PLAN' }).map((i) => i.vehiculo.id), [3]);
    assert.deepEqual(filtrarEstadoService(items, { tipoVehiculoId: '3' }).map((i) => i.vehiculo.id), [2]);
  });
});

describe('ordenarEstadoService', () => {
  // Los dos tienen 900 km restantes, pero el colectivo consumió el 95,5 % de su
  // intervalo y el utilitario el 91 %: el colectivo es más urgente.
  const colectivo = item(1, '12', 'PROXIMO', { porcentajeConsumido: 0.955, kmDesdeService: 19100 });
  const utilitario = item(2, '3', 'AL_DIA', {
    tipoVehiculo: 'Utilitario',
    tipoVehiculoId: 4,
    porcentajeConsumido: 0.91,
    kmDesdeService: 9100,
  });
  const vencido = item(3, '20', 'VENCIDO', { porcentajeConsumido: 1.05, kmDesdeService: 21000 });
  const sinPlan = item(4, '1', 'SIN_PLAN');
  const items = [sinPlan, utilitario, colectivo, vencido];

  test('por defecto, más urgente: % del intervalo consumido, SIN_PLAN al final', () => {
    assert.deepEqual(ordenarEstadoService(items).map((i) => i.vehiculo.id), [3, 1, 2, 4]);
  });

  test('por número de interno, en orden natural', () => {
    assert.deepEqual(ordenarEstadoService(items, 'interno').map((i) => i.vehiculo.numeroInterno), ['1', '3', '12', '20']);
  });

  test('por tipo de vehículo y, dentro de cada uno, interno', () => {
    assert.deepEqual(ordenarEstadoService(items, 'tipo').map((i) => i.vehiculo.id), [4, 1, 3, 2]);
  });

  test('por km desde el último service, SIN_PLAN al final', () => {
    assert.deepEqual(ordenarEstadoService(items, 'km').map((i) => i.vehiculo.id), [3, 1, 2, 4]);
  });

  test('no modifica la lista original', () => {
    const copia = [...items];
    ordenarEstadoService(items);
    assert.deepEqual(items, copia);
  });
});

describe('textos de la tarjeta de Service', () => {
  test('contarAlertas suma vencidos y próximos', () => {
    assert.equal(contarAlertas([item(1, '1', 'VENCIDO'), item(2, '2', 'PROXIMO'), item(3, '3', 'AL_DIA'), item(4, '4', 'SIN_PLAN')]), 2);
  });

  test('detalle: faltan, pasado por, le toca ahora y sin plan', () => {
    const base = { kmProximoService: 340000 };
    assert.equal(
      detalleEstadoService({ ...base, estado: 'PROXIMO', kmRestantes: 800, kmExcedidos: 0 }),
      'Próximo service a los 340.000 km · faltan 800 km'
    );
    assert.equal(
      detalleEstadoService({ ...base, estado: 'VENCIDO', kmRestantes: 0, kmExcedidos: 1200 }),
      'Próximo service a los 340.000 km · pasado por 1.200 km'
    );
    assert.match(detalleEstadoService({ ...base, estado: 'VENCIDO', kmRestantes: 0, kmExcedidos: 0 }), /le toca ahora/);
    assert.match(detalleEstadoService({ estado: 'SIN_PLAN' }), /Sin plan/);
  });

  test('intervalo: "Colectivo · service cada 20.000 km"', () => {
    assert.equal(textoIntervalo(item(1, '1', 'AL_DIA')), 'Colectivo · service cada 20.000 km');
    assert.equal(textoIntervalo({ ...item(1, '1', 'SIN_PLAN'), plantilla: null }), 'Colectivo');
  });
});

describe('textos del historial', () => {
  const service = { tipo: 'SERVICE', kilometraje: 57345, observaciones: null, descripcion: null, repuestos: null, responsable: null };
  const arreglo = {
    tipo: 'ARREGLO',
    kilometraje: 57345,
    descripcion: 'Cambio de pastillas',
    observaciones: 'Revisar en 5.000 km',
    repuestos: 'Pastillas Frasle',
    responsable: 'Taller Gómez',
  };

  test('línea principal: la descripción o la observación', () => {
    assert.equal(textoRegistro(service), 'Service completo');
    assert.equal(textoRegistro({ ...service, observaciones: 'Sin novedades' }), 'Sin novedades');
    assert.equal(textoRegistro(arreglo), 'Cambio de pastillas');
    assert.equal(textoRegistro({ ...arreglo, descripcion: null }), 'Revisar en 5.000 km');
  });

  test('línea principal: el "¿Qué trabajo?" de "Otro" no se repite (va en "Trabajos realizados")', () => {
    const soloOtro = {
      tipo: 'ARREGLO',
      descripcion: null,
      observaciones: null,
      tiposArreglo: [{ id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' }],
    };
    assert.equal(textoRegistro(soloOtro), 'Sin descripción');
    assert.equal(textoRegistro({ ...soloOtro, descripcion: 'Con tornillos nuevos' }), 'Con tornillos nuevos');
  });

  test('trabajos: los tipos en el orden del catálogo, aunque sea uno solo', () => {
    const tipos = [
      { id: 1, nombre: 'Engrase' },
      { id: 4, nombre: 'Frenos' },
    ];
    assert.equal(textoTrabajos({ ...arreglo, tiposArreglo: tipos }), 'Engrase, Frenos');
    assert.equal(textoTrabajos({ ...arreglo, tiposArreglo: [tipos[0]] }), 'Engrase');
    assert.equal(textoTrabajos(service), '');
  });
});

describe('validarRegistroMantenimiento', () => {
  const opciones = { hoy: '2026-10-23', maxTexto: 500, maxDetalleTipo: 60 };
  const valido = { vehiculoId: '7', fecha: '2026-10-23', kilometraje: '57345', observaciones: '' };

  test('un service completo no tiene errores', () => {
    assert.deepEqual(validarRegistroMantenimiento(valido, opciones), {});
  });

  test('junta todos los errores: vehículo, fecha futura y km', () => {
    const errores = validarRegistroMantenimiento({ vehiculoId: '', fecha: '2026-10-24', kilometraje: '57.345' }, opciones);
    assert.deepEqual(Object.keys(errores).sort(), ['fecha', 'kilometraje', 'vehiculoId']);
    assert.match(errores.fecha, /posterior a hoy/);
  });

  test('arreglo: el km no puede ser menor al odómetro (igual sí)', () => {
    const conMinimo = (kilometraje) =>
      validarRegistroMantenimiento({ ...valido, kilometraje }, { ...opciones, kmMinimo: 57345 }).kilometraje;
    assert.equal(
      conMinimo('57344'),
      'Cargá un kilometraje válido: no puede ser menor al odómetro actual (57.345 km). Si es un arreglo anterior, marcalo abajo.'
    );
    assert.equal(conMinimo('57345'), undefined);
    assert.equal(validarRegistroMantenimiento({ ...valido, kilometraje: '1' }, opciones).kilometraje, undefined);

    const anterior = validarRegistroMantenimiento({ ...valido, kilometraje: '50000', esAnterior: true }, { ...opciones, kmMinimo: 57345 });
    assert.equal(anterior.kilometraje, undefined);
  });

  test('esKmAnterior: solo un entero menor al odómetro', () => {
    assert.equal(esKmAnterior('999', 1000), true);
    assert.equal(esKmAnterior(' 1000 ', 1000), false);
    assert.equal(esKmAnterior('', 1000), false);
    assert.equal(esKmAnterior('9.99', 1000), false);
    assert.equal(esKmAnterior('5', undefined), false);
  });

  test('arreglo: tipo obligatorio y detalle si el tipo lo pide', () => {
    const arreglo = { ...valido, tiposArregloIds: [], descripcion: '', responsableId: '', repuestos: '' };
    const sinTipo = validarRegistroMantenimiento(arreglo, { ...opciones, esArreglo: true });
    assert.deepEqual(sinTipo, { tiposArregloIds: 'Elegí al menos un tipo de trabajo' });

    const otro = { id: 8, nombre: 'Otro', requiereDetalle: true };
    const sinDetalle = validarRegistroMantenimiento(
      { ...arreglo, tiposArregloIds: [8], detallesTipos: {} },
      { ...opciones, esArreglo: true, tiposArreglo: [otro] }
    );
    // La descripción vacía ya no es un error: lo que falta es el "¿Qué trabajo?".
    assert.deepEqual(Object.keys(sinDetalle), ['detallesTipos']);
    assert.equal(sinDetalle.detallesTipos, 'Contá qué trabajo se hizo (obligatorio para "Otro")');
  });

  test('arreglo: "Otro" pide su detalle (no vacío, hasta 60); sin "Otro" no', () => {
    const base = { ...valido, descripcion: '', responsableId: '', repuestos: '' };
    const engrase = { id: 1, nombre: 'Engrase', requiereDetalle: false };
    const otro = { id: 8, nombre: 'Otro', requiereDetalle: true };
    const conOtro = (detallesTipos) =>
      validarRegistroMantenimiento(
        { ...base, tiposArregloIds: [1, 8], detallesTipos },
        { ...opciones, esArreglo: true, tiposArreglo: [engrase, otro] }
      );
    assert.match(conOtro({ 8: '   ' }).detallesTipos, /"Otro"/);
    assert.equal(conOtro({ 8: 'x'.repeat(61) }).detallesTipos, 'Hasta 60 caracteres');
    assert.deepEqual(conOtro({ 8: 'Cambio de espejo' }), {});

    const sinOtro = validarRegistroMantenimiento(
      { ...base, tiposArregloIds: [1] },
      { ...opciones, esArreglo: true, tiposArreglo: [engrase] }
    );
    assert.deepEqual(sinOtro, {});
  });

  test('textoTiposArreglo: siempre "N trabajos" ("1 trabajo" en singular)', () => {
    const tipos = [
      { id: 1, nombre: 'Engrase', detalle: null },
      { id: 3, nombre: 'Cambio de cubiertas', detalle: null },
      { id: 4, nombre: 'Frenos', detalle: null },
    ];
    assert.equal(textoTiposArreglo({ tiposArreglo: [tipos[2]] }), '1 trabajo');
    assert.equal(textoTiposArreglo({ tiposArreglo: [tipos[0], tipos[2]] }), '2 trabajos');
    assert.equal(textoTiposArreglo({ tiposArreglo: tipos }), '3 trabajos');
    assert.equal(textoTiposArreglo({ tiposArreglo: [...tipos, ...tipos] }), '6 trabajos');
    assert.equal(textoTiposArreglo({ tiposArreglo: [] }), 'Arreglo');
  });

  test('"Otro" se muestra con su detalle; uno viejo sin detalle, como "Otro"', () => {
    const otro = { id: 8, nombre: 'Otro', detalle: 'Cambio de espejo' };
    const engrase = { id: 1, nombre: 'Engrase', detalle: null };
    assert.equal(nombreTipoArreglo(otro), 'Cambio de espejo');
    assert.equal(nombreTipoArreglo({ ...otro, detalle: null }), 'Otro');
    assert.equal(textoTrabajos({ tipo: 'ARREGLO', tiposArreglo: [engrase, otro] }), 'Engrase, Cambio de espejo');
  });
});

describe('textoIncluyeService', () => {
  test('con la plantilla del service: una sola oración, con "y" antes de la última tarea', () => {
    assert.equal(
      textoIncluyeService(TAREAS_SERVICE),
      'Incluye: Cambio de aceite + Filtros de gasoil, aceite y habitáculo (aire acondicionado) + Alineado y balanceado + Revisión general del motor.'
    );
  });

  test('se arma con las tareas que recibe, no con un texto fijo', () => {
    assert.equal(textoIncluyeService(['Cambio de aceite']), 'Incluye: Cambio de aceite.');
    assert.equal(textoIncluyeService(['Engrase', 'Lavado', 'Órbita de prueba']), 'Incluye: Engrase + Lavado + Órbita de prueba.');
  });
});

describe('textoAdvertenciaViaje', () => {
  test('con separador de miles y sin emoji', () => {
    const texto = textoAdvertenciaViaje({
      yaVencido: false,
      kmProximoService: 21000,
      kmFinalEstimado: 21200,
      kmRestantes: 1000,
    });
    assert.equal(
      texto,
      'Con este viaje el vehículo llegaría a los 21.200 km y pasaría su service, que le toca a los 21.000 km (faltan 1.000 km).'
    );
    assert.match(textoAdvertenciaViaje({ yaVencido: true, kmProximoService: 21000, kmExcedidos: 500 }), /ya pasó su service.*500 km de más/);
  });
});
