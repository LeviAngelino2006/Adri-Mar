// Tests del aviso por WhatsApp: normalización del teléfono, link y mensaje.
// Se corren con `npm test` (node:test, sin dependencias).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIVO_SIN_TELEFONO,
  MOTIVO_TELEFONO_INVALIDO,
  armarMensajeViaje,
  avisoWhatsApp,
  interpretacionesSinQuince,
  normalizarTelefonoAR,
  urlWhatsApp,
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

describe('urlWhatsApp', () => {
  test('arma https://wa.me/<telefono>?text=<mensaje codificado>', () => {
    const url = urlWhatsApp('5493571612345', 'Hola Ana!');
    assert.equal(url, 'https://wa.me/5493571612345?text=Hola%20Ana!');
  });

  test('el mensaje sobrevive a la codificación (saltos de línea, &, #, tildes y emojis)', () => {
    const mensaje = 'Línea 1\nLínea 2 & más #3 — 📍 Río Tercero → Córdoba';

    const texto = new URL(urlWhatsApp('5493571612345', mensaje)).searchParams.get('text');

    assert.equal(texto, mensaje);
  });
});

describe('armarMensajeViaje', () => {
  const origen = { id: 1, nombre: 'Río Tercero' };
  const destino = { id: 2, nombre: 'Córdoba' };
  const paradas = [
    { orden: 1, ubicacion: { id: 3, nombre: 'Alta Gracia' } },
    { orden: 2, ubicacion: { id: 4, nombre: 'Museo del Kempes' } },
  ];

  // 20/10/2026 de 08:00 a 12:30 en Córdoba (UTC-3).
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

  const enlaceMapa = (v) => urlRecorrido({ origen: v.origen, paradas: v.paradas.map((p) => p.ubicacion), destino: v.destino });

  test('el mensaje completo, con recorrido, pasajeros y el link de Google Maps al final', () => {
    const esperado = [
      'Hola Ana! Te confirmo el viaje:',
      '📅 20/10 · 08:00 a 12:30',
      '🚌 Interno 12 (AE452KD)',
      '📍 Río Tercero → Alta Gracia → Museo del Kempes → Córdoba',
      '👥 45 pasajeros',
      'Cliente: ACME',
      '🗺️ Ver recorrido en Google Maps:',
      enlaceMapa(viajeBase),
    ].join('\n');

    assert.equal(armarMensajeViaje(viajeBase), esperado);
  });

  test('el link de Google Maps es el último renglón y es el de urlRecorrido', () => {
    const lineas = armarMensajeViaje(viajeBase).split('\n');

    assert.equal(lineas.at(-1), enlaceMapa(viajeBase));
    assert.ok(lineas.at(-1).startsWith('https://www.google.com/maps/dir/'));
    assert.equal(lineas.at(-2), '🗺️ Ver recorrido en Google Maps:');
  });

  test('sin paradas el recorrido es "Origen → Destino" y el link no lleva waypoints', () => {
    const mensaje = armarMensajeViaje({ ...viajeBase, paradas: [] });

    assert.ok(mensaje.includes('📍 Río Tercero → Córdoba\n'));
    assert.ok(!new URL(mensaje.split('\n').at(-1)).searchParams.has('waypoints'));
  });

  test('la línea de pasajeros solo aparece si la cantidad está cargada', () => {
    for (const vacio of [null, undefined, '']) {
      const mensaje = armarMensajeViaje({ ...viajeBase, cantidadPasajeros: vacio });
      assert.ok(!mensaje.includes('👥'), `no debería haber línea de pasajeros con ${String(vacio)}`);
      assert.ok(!mensaje.includes('pasajero'));
    }
  });

  test('con un solo pasajero va en singular', () => {
    assert.ok(armarMensajeViaje({ ...viajeBase, cantidadPasajeros: 1 }).includes('👥 1 pasajero\n'));
    assert.ok(armarMensajeViaje({ ...viajeBase, cantidadPasajeros: 2 }).includes('👥 2 pasajeros\n'));
  });

  test('un viaje que termina otro día lleva la fecha en el fin', () => {
    const mensaje = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:00:00.000Z', // 20/10 22:00 en Córdoba
      fechaFin: '2026-10-21T09:00:00.000Z', // 21/10 06:00
    });

    assert.ok(mensaje.includes('📅 20/10 · 22:00 a 21/10 06:00\n'));
  });

  test('la fecha y la hora son las de Córdoba aunque el instante en UTC caiga en otro día', () => {
    // 20/10 00:30 en Córdoba = 03:30 UTC del mismo día; 19/10 23:00 = 02:00 UTC del 20.
    const medianoche = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-20T03:30:00.000Z',
      fechaFin: '2026-10-20T08:00:00.000Z',
    });
    assert.ok(medianoche.includes('📅 20/10 · 00:30 a 05:00\n'), medianoche);

    const noche = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:30:00.000Z',
      fechaFin: '2026-10-21T02:30:00.000Z',
    });
    assert.ok(noche.includes('📅 20/10 · 22:30 a 23:30\n'), noche);
  });

  test('omite las líneas cuyo dato falta en vez de dejarlas vacías', () => {
    const mensaje = armarMensajeViaje({ ...viajeBase, cliente: null, vehiculo: null });

    assert.ok(!mensaje.includes('Cliente'));
    assert.ok(!mensaje.includes('🚌'));
    assert.ok(mensaje.includes('📍'));
  });

  test('sin origen o sin destino no hay recorrido ni link', () => {
    const mensaje = armarMensajeViaje({ ...viajeBase, origen: null });

    assert.ok(!mensaje.includes('📍'));
    assert.ok(!mensaje.includes('🗺️'));
    assert.ok(!mensaje.includes('http'));
  });

  test('el saludo usa el nombre del chofer', () => {
    assert.ok(armarMensajeViaje({ ...viajeBase, chofer: { nombre: 'Beto' } }).startsWith('Hola Beto! Te confirmo el viaje:\n'));
  });

  test('un viaje sin la clave paradas (por ejemplo, histórico) no rompe', () => {
    const { paradas: _omitida, ...sinParadas } = viajeBase;
    assert.ok(armarMensajeViaje(sinParadas).includes('📍 Río Tercero → Córdoba'));
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

  test('con teléfono válido devuelve el link wa.me con el teléfono normalizado y el mensaje', () => {
    const { url, motivo } = avisoWhatsApp(viaje);

    assert.equal(motivo, undefined);
    assert.ok(url.startsWith('https://wa.me/5493571612345?text='));
    assert.equal(new URL(url).searchParams.get('text'), armarMensajeViaje(viaje));
  });

  test('sin teléfono cargado: el motivo del handoff', () => {
    for (const telefono of [null, undefined, '', '   ']) {
      assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana', telefono } }), {
        motivo: 'El chofer no tiene teléfono cargado',
      });
    }
    assert.equal(MOTIVO_SIN_TELEFONO, 'El chofer no tiene teléfono cargado');
  });

  test('sin la clave telefono (un perfil que no la ve) también es "sin teléfono"', () => {
    assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana' } }), { motivo: MOTIVO_SIN_TELEFONO });
    assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: null }), { motivo: MOTIVO_SIN_TELEFONO });
  });

  test('con teléfono que no se entiende: otro motivo, que dice cómo corregirlo', () => {
    for (const telefono of ['612345', '15 612345', 'llamar a la oficina', '3571 99 612345']) {
      assert.deepEqual(avisoWhatsApp({ ...viaje, chofer: { nombre: 'Ana', telefono } }), {
        motivo: MOTIVO_TELEFONO_INVALIDO,
      });
    }
    assert.ok(MOTIVO_TELEFONO_INVALIDO.includes('Usuarios'));
    assert.notEqual(MOTIVO_TELEFONO_INVALIDO, MOTIVO_SIN_TELEFONO);
  });

  test('el peor caso (9 paradas con nombres largos) genera un link de largo razonable', () => {
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
    const conMuchas = {
      ...viaje,
      cantidadPasajeros: 45,
      paradas: nombres.map((nombre, i) => ({ orden: i + 1, ubicacion: { id: i + 3, nombre } })),
    };

    const { url } = avisoWhatsApp(conMuchas);

    // Los navegadores y WhatsApp aceptan URLs de varios miles de caracteres; se
    // deja un tope holgado para detectar si el mensaje crece sin querer.
    assert.ok(url.length < 4000, `el link mide ${url.length} caracteres`);
  });
});
