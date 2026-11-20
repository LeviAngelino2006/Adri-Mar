// Botonera de la ficha de un viaje (SCRUM-246): a lo sumo un primary por fila.
// Recorre todos los estados × perfiles (y el chofer del viaje o uno ajeno, con
// Comenzar libre o bloqueado por otro viaje en curso) con la misma visibilidad
// que usa Viajes.jsx. Se corre con `npm test` (node:test).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const h = React.createElement;

let vite;
let BotoneraDetalleViaje;

before(async () => {
  vite = await createServer({ root: RAIZ, server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' });
  BotoneraDetalleViaje = (await vite.ssrLoadModule('/src/components/BotoneraDetalleViaje.jsx')).default;
});

after(() => vite.close());

const ESTADOS = ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE', 'FINALIZADO', 'CANCELADO'];
const PERFILES = ['ADMINISTRADOR', 'ENCARGADO', 'CHOFER', 'PERSONAL_TALLER'];
const GESTORES = ['ADMINISTRADOR', 'ENCARGADO'];
// Acción que avanza cada estado: la única que puede ir en primary.
const PRIMARIA_DEL_ESTADO = {
  A_CONFIRMAR: 'Confirmar viaje',
  PROGRAMADO: 'Comenzar viaje',
  EN_VIAJE: 'Finalizar viaje',
};

const viaje = (estado) => ({
  id: 1,
  estado,
  choferId: 5,
  chofer: { id: 5, nombre: 'Ana', apellido: 'Pérez', telefono: '3571 555555' },
  vehiculoId: 7,
  origen: { nombre: 'Río Tercero' },
  destino: { nombre: 'Córdoba' },
  paradas: [],
  fechaInicio: '2026-10-09T10:30:00Z',
});
// Otro viaje del mismo chofer ya En viaje: Comenzar queda deshabilitado.
const EN_CURSO_QUE_BLOQUEA = [{ ...viaje('EN_VIAJE'), id: 2 }];

const noop = () => {};

function botones(estado, perfil, { esSuChofer, enCurso }) {
  const puedeGestionar = GESTORES.includes(perfil);
  const html = renderToStaticMarkup(
    h(BotoneraDetalleViaje, {
      viaje: viaje(estado),
      perfil,
      puedeGestionar,
      // Mismo cálculo que Viajes.jsx: gestor o el chofer del viaje.
      puedeOperar: puedeGestionar || esSuChofer,
      enCurso,
      onComenzar: noop,
      onVerViajeEnCurso: noop,
      onFinalizar: noop,
      onConfirmar: noop,
      onEditar: noop,
      onDuplicar: noop,
      onCancelar: noop,
    })
  );
  const { document } = new JSDOM(html).window;
  return [...document.querySelectorAll('.btn')].map((b) => ({
    texto: b.textContent.replace(' (se abre en una pestaña nueva)', '').trim(),
    variante: [...b.classList].find((c) => c.startsWith('btn-') && c !== 'btn'),
  }));
}

const CASOS = [];
for (const estado of ESTADOS) {
  for (const perfil of PERFILES) {
    for (const esSuChofer of [false, true]) {
      for (const [nombreEnCurso, enCurso] of [['libre', []], ['bloqueado', EN_CURSO_QUE_BLOQUEA]]) {
        CASOS.push({ estado, perfil, esSuChofer, enCurso, nombre: `${estado} / ${perfil}${esSuChofer ? ' (su chofer)' : ''} / ${nombreEnCurso}` });
      }
    }
  }
}

describe('Botonera del detalle de viaje: a lo sumo un primary', () => {
  test('ningún estado ni perfil muestra dos primary a la vez, y el primary es la acción del estado', () => {
    for (const { estado, perfil, esSuChofer, enCurso, nombre } of CASOS) {
      const primarios = botones(estado, perfil, { esSuChofer, enCurso }).filter((b) => b.variante === 'btn-primary');
      assert.ok(primarios.length <= 1, `${nombre}: ${primarios.map((b) => b.texto).join(', ')}`);
      for (const b of primarios) assert.equal(b.texto, PRIMARIA_DEL_ESTADO[estado], nombre);
    }
  });

  test('cada acción usa su variante: secondary WhatsApp / Editar / Duplicar, danger solo Cancelar', () => {
    const VARIANTE = {
      'Confirmar viaje': 'btn-primary',
      'Comenzar viaje': 'btn-primary',
      'Finalizar viaje': 'btn-primary',
      'Avisar por WhatsApp': 'btn-secondary',
      'Editar viaje': 'btn-secondary',
      'Duplicar viaje': 'btn-secondary',
      'Cancelar viaje': 'btn-danger',
    };
    for (const { estado, perfil, esSuChofer, enCurso, nombre } of CASOS) {
      for (const b of botones(estado, perfil, { esSuChofer, enCurso })) {
        assert.equal(b.variante, VARIANTE[b.texto], `${nombre}: ${b.texto}`);
      }
    }
  });

  test('gestor sobre un Programado: Comenzar primary y el resto en la misma fila', () => {
    assert.deepEqual(
      botones('PROGRAMADO', 'ADMINISTRADOR', { esSuChofer: false, enCurso: [] }).map((b) => b.texto),
      ['Comenzar viaje', 'Avisar por WhatsApp', 'Editar viaje', 'Duplicar viaje', 'Cancelar viaje']
    );
  });

  test('sin acciones visibles no se renderiza la fila', () => {
    for (const estado of ['FINALIZADO', 'CANCELADO']) {
      assert.deepEqual(botones(estado, 'CHOFER', { esSuChofer: true, enCurso: [] }), [], estado);
    }
  });
});
