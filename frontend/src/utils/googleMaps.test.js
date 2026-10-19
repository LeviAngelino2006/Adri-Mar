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

// --- Lugar en el mapa: placeId, coordenadas o nombre -------------------------

const CASA = { nombre: 'Av. Colón 1234, X5000 Córdoba', placeId: 'ChIJ_casa' };
const AEROPUERTO = { nombre: 'Aeropuerto Internacional Ing. Ambrosio L.V. Taravella', placeId: 'ChIJ_aeropuerto' };
const COSQUIN = { nombre: 'Cosquín', latitud: -31.2437, longitud: -64.4653 };
const MONSERRAT = { nombre: 'Colegio Nacional de Monserrat' };

test('con placeId: origin_place_id y destination_place_id, con el nombre como texto', () => {
  const params = parametros(urlRecorrido({ origen: CASA, destino: AEROPUERTO }));

  assert.equal(params.get('origin'), 'Av. Colón 1234, X5000 Córdoba');
  assert.equal(params.get('origin_place_id'), 'ChIJ_casa');
  assert.equal(params.get('destination'), 'Aeropuerto Internacional Ing. Ambrosio L.V. Taravella, Córdoba, Argentina');
  assert.equal(params.get('destination_place_id'), 'ChIJ_aeropuerto');
});

test('sin placeId pero con coordenadas: "lat,lng" y sin place_id', () => {
  const params = parametros(urlRecorrido({ origen: COSQUIN, destino: { nombre: 'Córdoba', latitud: -31.4168, longitud: -64.1836 } }));

  assert.equal(params.get('origin'), '-31.2437,-64.4653');
  assert.equal(params.get('destination'), '-31.4168,-64.1836');
  assert.equal(params.has('origin_place_id'), false);
  assert.equal(params.has('destination_place_id'), false);
});

test('sin placeId ni coordenadas: el nombre con la regla de siempre', () => {
  const params = parametros(urlRecorrido({ origen: MONSERRAT, destino: COSQUIN }));
  assert.equal(params.get('origin'), 'Colegio Nacional de Monserrat, Córdoba, Argentina');
  assert.equal(params.get('destination'), '-31.2437,-64.4653');
});

test('paradas todas con placeId: waypoint_place_ids en el mismo orden que waypoints', () => {
  const params = parametros(urlRecorrido({ origen: COSQUIN, paradas: [CASA, AEROPUERTO], destino: COSQUIN }));

  assert.equal(params.get('waypoint_place_ids'), 'ChIJ_casa|ChIJ_aeropuerto');
  assert.equal(
    params.get('waypoints'),
    'Av. Colón 1234, X5000 Córdoba|Aeropuerto Internacional Ing. Ambrosio L.V. Taravella, Córdoba, Argentina'
  );
});

test('paradas mezcladas: sin waypoint_place_ids; cada una por su dirección, coordenadas o nombre', () => {
  const params = parametros(urlRecorrido({ origen: CASA, paradas: [CASA, COSQUIN, MONSERRAT], destino: AEROPUERTO }));

  assert.equal(params.has('waypoint_place_ids'), false);
  assert.equal(
    params.get('waypoints'),
    'Av. Colón 1234, X5000 Córdoba|-31.2437,-64.4653|Colegio Nacional de Monserrat, Córdoba, Argentina'
  );
});

test('la key de Google nunca va en el link (no la necesita)', () => {
  const url = urlRecorrido({ origen: CASA, destino: AEROPUERTO });
  assert.equal(new URL(url).searchParams.has('key'), false);
});
