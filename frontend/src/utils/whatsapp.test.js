// Tests del aviso por WhatsApp: normalización del teléfono, mensaje y motivos.
// El link wa.me (encodeURIComponent) se prueba en
// components/avisarPorWhatsApp.render.test.mjs. Se corren con `npm test`
// (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIVO_SIN_CHOFER,
  MOTIVO_SIN_TELEFONO,
  MOTIVO_TELEFONO_INVALIDO,
  armarMensajeWhatsApp,
  avisoWhatsApp,
  interpretacionesSinQuince,
  normalizarTelefonoAR,
  puedeAvisarPorWhatsApp,
} from './whatsapp.js';
import { urlRecorrido } from './googleMaps.js';

describe('normalizarTelefonoAR: formatos que se aceptan', () => {
  // [entrada, resultado esperado]
  const ACEPTADOS = [
    // Río Tercero (3571), 6 dígitos de abonado.
    ['03571 15-612345', '5493571612345'],
    ['(03571) 15 612345', '5493571612345'],
    ['3571 15 612345', '5493571612345'],
    ['3571612345', '5493571612345'],
    ['03571612345', '5493571612345'],
    ['  3571.612.345  ', '5493571612345'],
    ['+54 9 3571 61-2345', '5493571612345'],
    ['5493571612345', '5493571612345'],
    ['+54 3571 612345', '5493571612345'],
    ['54 3571 612345', '5493571612345'],
    ['+54 03571 612345', '5493571612345'],
    ['+54 3571 15 612345', '5493571612345'],
    ['0054 9 3571 612345', '5493571612345'],
    // Córdoba capital (351), 7 dígitos de abonado.
    ['0351 15-412-3456', '5493514123456'],
    ['351 4123456', '5493514123456'],
    ['+54 9 351 412-3456', '5493514123456'],
    ['(0351) 15 4123456', '5493514123456'],
    // Buenos Aires (11), 8 dígitos de abonado.
    ['011 15 1234-5678', '5491112345678'],
    ['11 1234 5678', '5491112345678'],
    ['+54 9 11 1234-5678', '5491112345678'],
    ['11 15 3315 4455', '5491133154455'],
    // Un abonado que arranca con 15 pero SIN el 15 intercalado: son 10 dígitos.
    ['351 1512345', '5493511512345'],
    // Con el 15 intercalado Y un abonado que arranca con 15 ("…1515…"): el 15 cabe
    // en dos posiciones, pero las dos interpretaciones dan el mismo número.
    ['11 15 1512 3456', '5491115123456'],
    ['011 15 1512-3456', '5491115123456'],
  ];

  for (const [entrada, esperado] of ACEPTADOS) {
    test(`"${entrada}" → ${esperado}`, () => {
      assert.equal(normalizarTelefonoAR(entrada), esperado);
    });
  }

  test('es idempotente: normalizar un número ya normalizado lo deja igual', () => {
    for (const [, esperado] of ACEPTADOS) {
      assert.equal(normalizarTelefonoAR(esperado), esperado);
    }
  });

  test('acepta un número (no solo texto)', () => {
    assert.equal(normalizarTelefonoAR(3571612345), '5493571612345');
  });
});

describe('normalizarTelefonoAR: lo que no se puede normalizar da null', () => {
  const RECHAZADOS = [
    ['null', null],
    ['undefined', undefined],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['sin característica (solo abonado)', '612345'],
    ['celular local sin característica', '15 612345'],
    ['celular local sin característica (8 dígitos)', '15 1234 5678'],
    ['muy corto', '3571 6123'],
    ['demasiado largo', '3571 612345 789'],
    ['letras', 'abc'],
    ['con extensión escrita', '3571 612345 int 12'],
    ['dos números en uno', '3571 612345 / 3571 699999'],
    ['otro país (Paraguay)', '+595 981 123456'],
    ['otro país (EE. UU.)', '+1 202 555 0123'],
    ['otro país con 00', '00 1 202 555 0123'],
    ['línea 0800', '0800 333 4444'],
    ['característica que no existe', '4123 456789'],
    ['signo + en el medio', '3571+612345'],
    ['doble +', '++54 9 3571 612345'],
  ];

  for (const [nombre, entrada] of RECHAZADOS) {
    test(`${nombre} → null`, () => {
      assert.equal(normalizarTelefonoAR(entrada), null);
    });
  }
});

describe('normalizarTelefonoAR: el 15 en más de una posición posible', () => {
  // Con 12 dígitos hay un 15 intercalado. Si aparece en más de una de las posiciones
  // posibles (característica de 2, 3 o 4 dígitos), se aceptan solo las
  // interpretaciones que dan el MISMO número; si dieran números distintos sería
  // adivinar y se devolvería null.
  test('"11 15 1512 3456" es válido: el 15 cabe tras 2 y tras 4 dígitos pero ambas dan el mismo número', () => {
    assert.equal(normalizarTelefonoAR('11 15 1512 3456'), '5491115123456');
    assert.equal(normalizarTelefonoAR('111515123456'), '5491115123456');
  });

  test('la misma situación con otra característica', () => {
    assert.equal(normalizarTelefonoAR('351515123456'), '5493515123456');
  });

  test('y con prefijos', () => {
    assert.equal(normalizarTelefonoAR('+54 11 15 1512 3456'), '5491115123456');
    assert.equal(normalizarTelefonoAR('0111515123456'), '5491115123456');
  });

  test('interpretacionesSinQuince: las dos posiciones coinciden en un único resultado', () => {
    // 111515123456: el 15 está tras 2 dígitos y tras 4, y los dos caminos dan 1115123456.
    assert.deepEqual(interpretacionesSinQuince('111515123456'), ['1115123456']);
  });

  test('interpretacionesSinQuince: con el 15 en una sola posición hay un único resultado', () => {
    assert.deepEqual(interpretacionesSinQuince('357115612345'), ['3571612345']);
    assert.deepEqual(interpretacionesSinQuince('351154123456'), ['3514123456']);
  });

  test('interpretacionesSinQuince: sin 15 en ninguna posición posible no hay resultado', () => {
    assert.deepEqual(interpretacionesSinQuince('357199612345'), []);
  });

  test('con 12 dígitos y sin ningún 15 en una posición válida → null', () => {
    assert.equal(normalizarTelefonoAR('3571 99 612345'), null);
  });

  test('con el 15 en una única posición se resuelve (el caso normal)', () => {
    assert.equal(normalizarTelefonoAR('3571 15 612345'), '5493571612345');
    assert.equal(normalizarTelefonoAR('351 15 4123456'), '5493514123456');
    assert.equal(normalizarTelefonoAR('11 15 1234 5678'), '5491112345678');
  });
});

describe('normalizarTelefonoAR: casos que antes fallaban (SCRUM-250)', () => {
  // [entrada, resultado esperado]. Antes de SCRUM-250 todos daban null: el 9 de
  // celular solo se sacaba con 11 dígitos justos (no junto al 15 ni al 0) y el
  // guion largo se tomaba como un carácter inválido.
  const ARREGLADOS = [
    ['+54 9 3571 15 612345', '5493571612345'], // el 9 internacional y además el 15
    ['549 11 15 1234 5678', '5491112345678'],
    ['+54 9 351 15 412 3456', '5493514123456'],
    ['+54 9 0351 412-3456', '5493514123456'], // el 9 y además el 0 nacional
    ['3571–612345', '5493571612345'], // guion largo (pegado desde otro programa)
    ['0351 — 4123456', '5493514123456'],
  ];

  for (const [entrada, esperado] of ARREGLADOS) {
    test(`"${entrada}" → ${esperado}`, () => {
      assert.equal(normalizarTelefonoAR(entrada), esperado);
    });
  }

  test('lo que no se entendía sigue sin entenderse', () => {
    for (const entrada of ['+54 9 15 612345', '9 612345', '+54 9 4123 456789', '3571 – 612345 – 1']) {
      assert.equal(normalizarTelefonoAR(entrada), null, entrada);
    }
  });
});

describe('armarMensajeWhatsApp', () => {
  const origen = { id: 1, nombre: 'Río Tercero' };
  const destino = { id: 2, nombre: 'Córdoba' };
  const paradas = [
    { orden: 1, ubicacion: { id: 3, nombre: 'Alta Gracia' } },
    { orden: 2, ubicacion: { id: 4, nombre: 'Museo del Kempes' } },
  ];

  // Martes 20/10/2026 de 08:00 a 12:30 en Córdoba (UTC-3).
  const viajeBase = {
    chofer: { nombre: 'Ana', apellido: 'Pérez', telefono: '03571 15-612345' },
    vehiculo: { numeroInterno: '12', dominio: 'AE452KD' },
    cliente: { nombre: 'ACME' },
    origen,
    destino,
    paradas,
    cantidadPasajeros: 45,
    fechaInicio: '2026-10-20T11:00:00.000Z',
    fechaFin: '2026-10-20T15:30:00.000Z',
  };

  // El mismo link que arma el botón "Ver recorrido" de la ficha.
  const enlaceMapa = (v) =>
    urlRecorrido({ origen: v.origen, paradas: (v.paradas ?? []).map((p) => p.ubicacion), destino: v.destino });

  test('mensaje completo: saludo y un dato por línea, con la etiqueta en negrita', () => {
    const esperado = [
      'Hola Ana, te paso los datos de tu viaje:',
      '',
      '*Fecha:* martes 20/10/2026',
      '*Hora de inicio:* 08:00',
      '*Hora estimada de fin:* 12:30',
      '*Origen:* Río Tercero',
      '*Parada 1:* Alta Gracia',
      '*Parada 2:* Museo del Kempes',
      '*Destino:* Córdoba',
      '*Cliente:* ACME',
      '*Pasajeros:* 45',
      '*Vehículo:* Interno 12, patente AE452KD',
      `*Recorrido en Google Maps:* ${enlaceMapa(viajeBase)}`,
    ].join('\n');

    assert.equal(armarMensajeWhatsApp(viajeBase), esperado);
  });

  test('sin paradas, sin pasajeros y sin hora de fin: esas líneas no aparecen (ni vacías ni "No cargado")', () => {
    const mensaje = armarMensajeWhatsApp({ ...viajeBase, paradas: [], cantidadPasajeros: null, fechaFin: null });

    assert.equal(
      mensaje,
      [
        'Hola Ana, te paso los datos de tu viaje:',
        '',
        '*Fecha:* martes 20/10/2026',
        '*Hora de inicio:* 08:00',
        '*Origen:* Río Tercero',
        '*Destino:* Córdoba',
        '*Cliente:* ACME',
        '*Vehículo:* Interno 12, patente AE452KD',
        `*Recorrido en Google Maps:* ${enlaceMapa({ ...viajeBase, paradas: [] })}`,
      ].join('\n')
    );
    assert.ok(!/Parada|Pasajeros|fin:|No cargado/.test(mensaje));
    // La única línea vacía es la que separa el saludo de los datos.
    assert.equal(mensaje.split('\n').filter((linea) => linea.trim() === '').length, 1);
  });

  test('pasajeros vacíos de cualquier forma se omiten; una cantidad cargada se muestra', () => {
    for (const vacio of [null, undefined, '', '  ']) {
      assert.ok(!armarMensajeWhatsApp({ ...viajeBase, cantidadPasajeros: vacio }).includes('Pasajeros'), String(vacio));
    }
    assert.ok(armarMensajeWhatsApp({ ...viajeBase, cantidadPasajeros: 1 }).includes('\n*Pasajeros:* 1\n'));
  });

  test('un viaje sin la clave paradas (por ejemplo, histórico) no rompe', () => {
    const { paradas: _omitida, ...sinParadas } = viajeBase;
    assert.ok(!armarMensajeWhatsApp(sinParadas).includes('Parada'));
  });

  test('varias paradas salen en el orden del recorrido, numeradas, entre el origen y el destino', () => {
    const nombres = ['Alta Gracia', 'Villa Carlos Paz', 'Cosquín', 'La Falda'];
    // Llegan desordenadas a propósito: manda el campo `orden`.
    const desordenadas = [
      { orden: 3, ubicacion: { id: 12, nombre: 'Cosquín' } },
      { orden: 1, ubicacion: { id: 10, nombre: 'Alta Gracia' } },
      { orden: 4, ubicacion: { id: 13, nombre: 'La Falda' } },
      { orden: 2, ubicacion: { id: 11, nombre: 'Villa Carlos Paz' } },
    ];
    const lineas = armarMensajeWhatsApp({ ...viajeBase, paradas: desordenadas }).split('\n');

    const desdeOrigen = lineas.slice(lineas.indexOf('*Origen:* Río Tercero'));
    assert.deepEqual(desdeOrigen.slice(0, 6), [
      '*Origen:* Río Tercero',
      ...nombres.map((nombre, i) => `*Parada ${i + 1}:* ${nombre}`),
      '*Destino:* Córdoba',
    ]);

    // El link de Google Maps lleva las paradas en ese mismo orden.
    const link = lineas.at(-1).replace('*Recorrido en Google Maps:* ', '');
    const waypoints = new URL(link).searchParams.get('waypoints').split('|');
    assert.deepEqual(
      waypoints.map((w) => w.replace(', Córdoba, Argentina', '')),
      nombres
    );
  });

  test('el link es el mismo que el de "Ver recorrido" (urlRecorrido), con el placeId si lo hay', () => {
    const viaje = {
      ...viajeBase,
      origen: { id: 10, nombre: 'Av. Colón 1234, X5000 Córdoba', placeId: 'ChIJ_casa', latitud: null, longitud: null },
    };
    const ultima = armarMensajeWhatsApp(viaje).split('\n').at(-1);
    assert.equal(ultima, `*Recorrido en Google Maps:* ${enlaceMapa(viaje)}`);
    assert.equal(new URL(enlaceMapa(viaje)).searchParams.get('origin_place_id'), 'ChIJ_casa');
  });

  test('fecha y horas en formato argentino y en hora de Córdoba aunque en UTC sea otro día', () => {
    // 20/10 22:30 en Córdoba = 01:30 UTC del 21 (miércoles en UTC, martes en Córdoba).
    const lineas = armarMensajeWhatsApp({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:30:00.000Z',
      fechaFin: '2026-10-21T02:30:00.000Z',
    }).split('\n');
    assert.ok(lineas.includes('*Fecha:* martes 20/10/2026'));
    assert.ok(lineas.includes('*Hora de inicio:* 22:30'));
    assert.ok(lineas.includes('*Hora estimada de fin:* 23:30'));
  });

  test('si el viaje termina otro día, la hora de fin lleva su fecha', () => {
    const lineas = armarMensajeWhatsApp({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:00:00.000Z', // martes 20/10 22:00 en Córdoba
      fechaFin: '2026-10-21T09:00:00.000Z', // miércoles 21/10 06:00
    }).split('\n');
    assert.ok(lineas.includes('*Hora de inicio:* 22:00'));
    assert.ok(lineas.includes('*Hora estimada de fin:* 06:00 del miércoles 21/10/2026'));
  });

  test('en un viaje incompleto los datos que faltan se omiten en vez de salir vacíos', () => {
    const mensaje = armarMensajeWhatsApp({ ...viajeBase, cliente: null, vehiculo: null, origen: null });
    assert.ok(!/Cliente|Vehículo|Origen|Google Maps|undefined|null/.test(mensaje));
    assert.ok(mensaje.includes('*Destino:* Córdoba'));
  });

  test('el saludo usa el nombre del chofer', () => {
    assert.ok(armarMensajeWhatsApp({ ...viajeBase, chofer: { nombre: 'Beto' } }).startsWith('Hola Beto, '));
  });

  test('sin emojis: ningún carácter está fuera del plano básico de Unicode', () => {
    // Los emojis llegan como "�" en WhatsApp Desktop de Windows al abrir el link wa.me.
    const mensaje = armarMensajeWhatsApp(viajeBase);
    assert.deepEqual([...mensaje].filter((c) => c.codePointAt(0) > 0xffff), []);
    assert.ok(mensaje.includes('í'));
  });

  test('es pura: no modifica el viaje que recibe', () => {
    const copia = structuredClone(viajeBase);
    armarMensajeWhatsApp(viajeBase);
    assert.deepEqual(viajeBase, copia);
  });
});

describe('avisoWhatsApp', () => {
  const viaje = {
    chofer: { nombre: 'Ana', telefono: '03571 15-612345' },
    vehiculo: { numeroInterno: '12', dominio: 'AE452KD' },
    cliente: { nombre: 'ACME' },
    origen: { id: 1, nombre: 'Río Tercero' },
    destino: { id: 2, nombre: 'Córdoba' },
    paradas: [],
    cantidadPasajeros: null,
    fechaInicio: '2026-10-20T11:00:00.000Z',
    fechaFin: '2026-10-20T15:30:00.000Z',
  };

  test('con chofer y teléfono válido: el teléfono normalizado y el mensaje', () => {
    assert.deepEqual(avisoWhatsApp(viaje), { telefono: '5493571612345', mensaje: armarMensajeWhatsApp(viaje) });
    assert.equal(puedeAvisarPorWhatsApp(viaje), true);
  });

  test('sin chofer asignado: no se puede avisar, con su motivo', () => {
    for (const chofer of [null, undefined]) {
      assert.deepEqual(avisoWhatsApp({ ...viaje, chofer }), { motivo: MOTIVO_SIN_CHOFER });
    }
    assert.equal(MOTIVO_SIN_CHOFER, 'El viaje no tiene chofer asignado');
    assert.equal(puedeAvisarPorWhatsApp({ ...viaje, chofer: null }), false);
  });

  test('sin teléfono cargado (o sin la clave, en un perfil que no la ve)', () => {
    for (const telefono of [null, undefined, '', '   ']) {
      assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana', telefono } }), { motivo: MOTIVO_SIN_TELEFONO });
    }
    assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana' } }), { motivo: MOTIVO_SIN_TELEFONO });
    assert.equal(MOTIVO_SIN_TELEFONO, 'El chofer no tiene teléfono cargado');
  });

  test('con un teléfono que no se entiende: otro motivo, que dice cómo corregirlo', () => {
    for (const telefono of ['612345', '15 612345', 'llamar a la oficina', '3571 99 612345']) {
      assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana', telefono } }), {
        motivo: MOTIVO_TELEFONO_INVALIDO,
      });
    }
    assert.ok(MOTIVO_TELEFONO_INVALIDO.includes('Usuarios'));
  });

  test('el peor caso (9 paradas con nombres largos) da un link de largo razonable', () => {
    const nombres = [
      'Villa Carlos Paz',
      'Santa Rosa de Calamuchita',
      'Embalse Río Tercero',
      'San Francisco del Chañar',
      'Villa General Belgrano',
      'La Falda',
      'Alta Gracia',
      'Cosquín',
      'Jesús María',
    ];
    const { telefono, mensaje } = avisoWhatsApp({
      ...viaje,
      cantidadPasajeros: 45,
      paradas: nombres.map((nombre, i) => ({ orden: i + 1, ubicacion: { id: i + 3, nombre } })),
    });
    const largo = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`.length;
    // Los navegadores y WhatsApp aceptan URLs de varios miles de caracteres; el
    // tope holgado detecta si el mensaje crece sin querer.
    assert.ok(largo < 4000, `el link mide ${largo} caracteres`);
  });
});
