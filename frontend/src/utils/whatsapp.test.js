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

  test('el mensaje sobrevive a la codificación (saltos de línea, &, #, *, tildes y flecha)', () => {
    const mensaje = 'Línea 1\nLínea 2 & más #3 — *negrita* Río Tercero → Córdoba';

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

  // Martes 20/10/2026 de 08:00 a 12:30 en Córdoba (UTC-3).
  const viajeBase = {
    chofer: { nombre: 'Ana', apellido: 'Pérez', telefono: '03571 15-612345' },
    vehiculo: { numeroInterno: '12', dominio: 'AE452KD' },
    cliente: { nombre: 'ACME' },
    origen,
    destino,
    paradas: [],
    cantidadPasajeros: 45,
    fechaInicio: '2026-10-20T11:00:00.000Z',
    fechaFin: '2026-10-20T15:30:00.000Z',
  };

  const enlaceMapa = (v) =>
    urlRecorrido({ origen: v.origen, paradas: v.paradas.map((p) => p.ubicacion), destino: v.destino });

  test('el mensaje completo sin paradas: recorrido en una línea', () => {
    const esperado = [
      'Hola Ana, te confirmo el viaje del *martes 20/10*.',
      '',
      '*Horario:* 08:00 a 12:30',
      '*Vehículo:* Interno 12 (AE452KD)',
      '*Recorrido:* Río Tercero → Córdoba',
      '*Pasajeros:* 45',
      '*Cliente:* ACME',
      '',
      'Ver el recorrido en el mapa:',
      enlaceMapa(viajeBase),
    ].join('\n');

    assert.equal(armarMensajeViaje(viajeBase), esperado);
  });

  test('con paradas el recorrido va en vertical: el origen y cada punto siguiente con "→ " adelante', () => {
    const viaje = { ...viajeBase, paradas };

    const esperado = [
      'Hola Ana, te confirmo el viaje del *martes 20/10*.',
      '',
      '*Horario:* 08:00 a 12:30',
      '*Vehículo:* Interno 12 (AE452KD)',
      '*Recorrido:*',
      'Río Tercero',
      '→ Alta Gracia',
      '→ Museo del Kempes',
      '→ Córdoba',
      '*Pasajeros:* 45',
      '*Cliente:* ACME',
      '',
      'Ver el recorrido en el mapa:',
      enlaceMapa(viaje),
    ].join('\n');

    assert.equal(armarMensajeViaje(viaje), esperado);
  });

  test('el link de Google Maps es el último renglón, es el de urlRecorrido y lleva las paradas', () => {
    const viaje = { ...viajeBase, paradas };
    const lineas = armarMensajeViaje(viaje).split('\n');

    assert.equal(lineas.at(-1), enlaceMapa(viaje));
    assert.equal(lineas.at(-2), 'Ver el recorrido en el mapa:');
    assert.equal(lineas.at(-3), '');
    assert.ok(new URL(lineas.at(-1)).searchParams.get('waypoints').includes('Alta Gracia'));
  });

  test('sin paradas el link no lleva waypoints', () => {
    assert.ok(!new URL(armarMensajeViaje(viajeBase).split('\n').at(-1)).searchParams.has('waypoints'));
  });

  test('el día de la semana va en español, en minúscula y en hora de Córdoba', () => {
    const DIAS = [
      ['2026-10-19T15:00:00.000Z', 'lunes 19/10'],
      ['2026-10-20T15:00:00.000Z', 'martes 20/10'],
      ['2026-10-21T15:00:00.000Z', 'miércoles 21/10'],
      ['2026-10-22T15:00:00.000Z', 'jueves 22/10'],
      ['2026-10-23T15:00:00.000Z', 'viernes 23/10'],
      ['2026-10-24T15:00:00.000Z', 'sábado 24/10'],
      ['2026-10-25T15:00:00.000Z', 'domingo 25/10'],
    ];

    for (const [inicio, esperado] of DIAS) {
      const primera = armarMensajeViaje({ ...viajeBase, fechaInicio: inicio, fechaFin: null }).split('\n')[0];
      assert.equal(primera, `Hola Ana, te confirmo el viaje del *${esperado}*.`);
    }
  });

  test('la fecha y la hora son las de Córdoba aunque el instante en UTC caiga en otro día', () => {
    // 20/10 00:30 en Córdoba = 03:30 UTC del mismo día.
    const madrugada = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-20T03:30:00.000Z',
      fechaFin: '2026-10-20T08:00:00.000Z',
    }).split('\n');
    assert.equal(madrugada[0], 'Hola Ana, te confirmo el viaje del *martes 20/10*.');
    assert.equal(madrugada[2], '*Horario:* 00:30 a 05:00');

    // 20/10 22:30 en Córdoba = 01:30 UTC del 21 (miércoles en UTC, martes en Córdoba).
    const noche = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:30:00.000Z',
      fechaFin: '2026-10-21T02:30:00.000Z',
    }).split('\n');
    assert.equal(noche[0], 'Hola Ana, te confirmo el viaje del *martes 20/10*.');
    assert.equal(noche[2], '*Horario:* 22:30 a 23:30');
  });

  test('un viaje que termina otro día lleva la fecha en cada hora', () => {
    const lineas = armarMensajeViaje({
      ...viajeBase,
      fechaInicio: '2026-10-21T01:00:00.000Z', // 20/10 22:00 en Córdoba
      fechaFin: '2026-10-21T09:00:00.000Z', // 21/10 06:00
    }).split('\n');

    assert.equal(lineas[0], 'Hola Ana, te confirmo el viaje del *martes 20/10*.');
    assert.equal(lineas[2], '*Horario:* 22:00 del 20/10 a 06:00 del 21/10');
  });

  test('sin hora de fin queda solo la de salida', () => {
    assert.equal(armarMensajeViaje({ ...viajeBase, fechaFin: null }).split('\n')[2], '*Horario:* 08:00');
  });

  test('la línea de pasajeros solo aparece si la cantidad está cargada', () => {
    for (const vacio of [null, undefined, '']) {
      const mensaje = armarMensajeViaje({ ...viajeBase, cantidadPasajeros: vacio });
      assert.ok(!mensaje.includes('Pasajeros'), `no debería haber pasajeros con ${String(vacio)}`);
    }
    assert.ok(armarMensajeViaje({ ...viajeBase, cantidadPasajeros: 1 }).includes('\n*Pasajeros:* 1\n'));
  });

  test('omite las líneas cuyo dato falta en vez de dejarlas vacías', () => {
    const mensaje = armarMensajeViaje({ ...viajeBase, cliente: null, vehiculo: null });

    assert.ok(!mensaje.includes('Cliente'));
    assert.ok(!mensaje.includes('Vehículo'));
    assert.ok(mensaje.includes('*Recorrido:*'));
  });

  test('sin origen o sin destino no hay recorrido ni link (ni la línea de "mapa")', () => {
    const mensaje = armarMensajeViaje({ ...viajeBase, origen: null });

    assert.ok(!mensaje.includes('Recorrido'));
    assert.ok(!mensaje.includes('mapa'));
    assert.ok(!mensaje.includes('http'));
    // Sin link tampoco queda la línea en blanco que lo separaba.
    assert.ok(!mensaje.endsWith('\n'));
  });

  test('el saludo usa el nombre del chofer', () => {
    assert.ok(
      armarMensajeViaje({ ...viajeBase, chofer: { nombre: 'Beto' } }).startsWith('Hola Beto, te confirmo el viaje del *')
    );
  });

  test('un viaje sin la clave paradas (por ejemplo, histórico) no rompe', () => {
    const { paradas: _omitida, ...sinParadas } = viajeBase;
    assert.ok(armarMensajeViaje(sinParadas).includes('*Recorrido:* Río Tercero → Córdoba'));
  });

  test('ningún carácter está fuera del plano básico de Unicode (sin emojis)', () => {
    // Los emojis (📅, 🚌, 🗺️…) llegan como "�" en WhatsApp Desktop de Windows al abrir el
    // link wa.me. Nada del mensaje armado puede estar por encima de U+FFFF.
    const fueraDelPlanoBasico = (texto) => [...texto].filter((caracter) => caracter.codePointAt(0) > 0xffff);

    const variantes = {
      'sin paradas': viajeBase,
      'con paradas': { ...viajeBase, paradas },
      'con 9 paradas': {
        ...viajeBase,
        paradas: Array.from({ length: 9 }, (_, i) => ({ orden: i + 1, ubicacion: { id: i + 3, nombre: `Parada ñandú ${i + 1}` } })),
      },
      'cruza de día': { ...viajeBase, fechaInicio: '2026-10-21T01:00:00.000Z', fechaFin: '2026-10-21T09:00:00.000Z' },
      'sin pasajeros ni cliente': { ...viajeBase, cantidadPasajeros: null, cliente: null },
      'sin hora de fin': { ...viajeBase, fechaFin: null },
    };

    for (const [nombre, viaje] of Object.entries(variantes)) {
      const mensaje = armarMensajeViaje(viaje);
      assert.deepEqual(fueraDelPlanoBasico(mensaje), [], `"${nombre}" tiene caracteres fuera del plano básico`);
    }

    // La flecha y los acentos sí tienen que estar (son del plano básico).
    const mensaje = armarMensajeViaje({ ...viajeBase, paradas });
    assert.ok(mensaje.includes('→') && mensaje.includes('í'));
  });

  test('el chequeo de emojis detecta uno de verdad', () => {
    const conEmoji = armarMensajeViaje({ ...viajeBase, cliente: { nombre: 'ACME 🚌' } });
    assert.ok([...conEmoji].some((caracter) => caracter.codePointAt(0) > 0xffff));
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
