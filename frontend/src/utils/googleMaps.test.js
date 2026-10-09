// Tests de urlRecorrido. Se corren con `npm test` (node:test, sin dependencias).
// Se parsea la URL en vez de comparar un string entero, para no depender de
// cómo URLSearchParams escapa espacios, comas y "|".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlRecorrido } from './googleMaps.js';

const parametros = (url) => new URL(url).searchParams;

test('sin paradas: origen, destino y modo auto, sin waypoints', () => {
  const url = urlRecorrido({ origen: { nombre: 'Río Tercero' }, destino: { nombre: 'Córdoba' } });
  const params = parametros(url);

  assert.equal(new URL(url).origin + new URL(url).pathname, 'https://www.google.com/maps/dir/');
  assert.equal(params.get('api'), '1');
  assert.equal(params.get('origin'), 'Río Tercero, Córdoba, Argentina');
  assert.equal(params.get('destination'), 'Córdoba, Córdoba, Argentina');
  assert.equal(params.get('travelmode'), 'driving');
  assert.equal(params.has('waypoints'), false);
});

test('paradas vacías o ausentes equivalen a sin paradas', () => {
  const base = { origen: { nombre: 'A' }, destino: { nombre: 'B' } };
  assert.equal(parametros(urlRecorrido({ ...base, paradas: [] })).has('waypoints'), false);
  assert.equal(parametros(urlRecorrido(base)).has('waypoints'), false);
});

test('con paradas: waypoints en orden, separados por "|"', () => {
  const url = urlRecorrido({
    origen: { nombre: 'Río Tercero' },
    paradas: [{ nombre: 'Alta Gracia' }, { nombre: 'Museo del Kempes' }],
    destino: { nombre: 'Córdoba' },
  });

  assert.equal(
    parametros(url).get('waypoints'),
    'Alta Gracia, Córdoba, Argentina|Museo del Kempes, Córdoba, Argentina'
  );
});

test('un nombre que ya trae coma no recibe el contexto de provincia', () => {
  const url = urlRecorrido({
    origen: { nombre: 'Villa Carlos Paz, Córdoba' },
    paradas: [{ nombre: 'Rosario, Santa Fe' }],
    destino: { nombre: 'Córdoba' },
  });
  const params = parametros(url);

  assert.equal(params.get('origin'), 'Villa Carlos Paz, Córdoba');
  assert.equal(params.get('waypoints'), 'Rosario, Santa Fe');
  assert.equal(params.get('destination'), 'Córdoba, Córdoba, Argentina');
});

test('sin origen devuelve null', () => {
  assert.equal(urlRecorrido({ origen: null, destino: { nombre: 'Córdoba' } }), null);
  assert.equal(urlRecorrido({ origen: { nombre: '' }, destino: { nombre: 'Córdoba' } }), null);
  assert.equal(urlRecorrido({ destino: { nombre: 'Córdoba' } }), null);
});

test('sin destino devuelve null', () => {
  assert.equal(urlRecorrido({ origen: { nombre: 'Río Tercero' }, destino: null }), null);
  assert.equal(urlRecorrido({ origen: { nombre: 'Río Tercero' } }), null);
});

test('las paradas sin nombre se ignoran', () => {
  const url = urlRecorrido({
    origen: { nombre: 'A' },
    paradas: [{ nombre: '' }, null, { nombre: 'Alta Gracia' }, {}],
    destino: { nombre: 'B' },
  });

  assert.equal(parametros(url).get('waypoints'), 'Alta Gracia, Córdoba, Argentina');
});

test('si todas las paradas están vacías no queda el parámetro waypoints', () => {
  const url = urlRecorrido({ origen: { nombre: 'A' }, paradas: [{ nombre: '' }, null], destino: { nombre: 'B' } });
  assert.equal(parametros(url).has('waypoints'), false);
});

test('un ida y vuelta repite el lugar sin problema', () => {
  const url = urlRecorrido({
    origen: { nombre: 'Río Tercero' },
    paradas: [{ nombre: 'Córdoba' }],
    destino: { nombre: 'Río Tercero' },
  });
  const params = parametros(url);

  assert.equal(params.get('origin'), params.get('destination'));
  assert.equal(params.get('waypoints'), 'Córdoba, Córdoba, Argentina');
});
