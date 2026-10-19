// Tests de utils/sugerenciasGoogle. Se corren con `npm test` (node:test).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  debeBuscarEnGoogle,
  debeConsultarGoogle,
  frecuenteExistenteDe,
  lugarDe,
  mensajeErrorGoogle,
  nuevoSessionToken,
  ofrecerCrearPorNombre,
} from './sugerenciasGoogle.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// El formato que acepta el backend (y Google): letras, números, - y _, hasta 36.
const FORMATO_BACKEND = /^[A-Za-z0-9_-]{1,36}$/;

describe('debeBuscarEnGoogle', () => {
  test('desde 3 letras, sin contar espacios de los bordes', () => {
    assert.equal(debeBuscarEnGoogle('ab'), false);
    assert.equal(debeBuscarEnGoogle('  ab  '), false);
    assert.equal(debeBuscarEnGoogle(''), false);
    assert.equal(debeBuscarEnGoogle(undefined), false);
    assert.equal(debeBuscarEnGoogle('col'), true);
  });
});

describe('nuevoSessionToken', () => {
  test('un UUID v4 distinto cada vez, con el formato que acepta el backend', () => {
    const a = nuevoSessionToken();
    const b = nuevoSessionToken();
    assert.match(a, UUID);
    assert.match(a, FORMATO_BACKEND);
    assert.notEqual(a, b);
  });

  test('sin randomUUID (http que no es localhost) lo arma con getRandomValues', () => {
    const token = nuevoSessionToken({ getRandomValues: (bytes) => bytes.fill(0xab) });
    assert.match(token, UUID);
  });

  test('sin crypto en absoluto igual devuelve un UUID válido', () => {
    assert.match(nuevoSessionToken({}), UUID);
  });
});

describe('mensajeErrorGoogle', () => {
  test('usa el mensaje del backend', () => {
    const err = { response: { status: 503, data: { error: 'Google Maps no está disponible: falta configurar GOOGLE_MAPS_API_KEY en el servidor.' } } };
    assert.match(mensajeErrorGoogle(err), /GOOGLE_MAPS_API_KEY/);
  });

  test('junta los errores por campo', () => {
    assert.equal(mensajeErrorGoogle({ response: { status: 400, data: { errores: { texto: 'Escribí al menos 3 letras.' } } } }), 'Escribí al menos 3 letras.');
  });

  test('sin respuesta: problema de conexión; respuesta sin mensaje: genérico', () => {
    assert.match(mensajeErrorGoogle(new Error('Network Error')), /No se pudo conectar/);
    assert.match(mensajeErrorGoogle({ response: { status: 500, data: {} } }), /No se pudo buscar/);
  });
});

describe('lugarDe', () => {
  test('placeId y coordenadas de la ubicación elegida (null si no tiene)', () => {
    assert.deepEqual(lugarDe({ id: 1, nombre: 'Casa', placeId: 'ChIJ_x' }), { placeId: 'ChIJ_x', latitud: null, longitud: null });
    assert.deepEqual(lugarDe({ id: 2, nombre: 'Cosquín', latitud: -31.2, longitud: -64.4 }), { placeId: null, latitud: -31.2, longitud: -64.4 });
    assert.equal(lugarDe(null), null);
  });
});

describe('debeConsultarGoogle (cuándo se le pregunta a Google)', () => {
  const base = { texto: 'monserrat', textoFrecuentes: 'monserrat', buscandoFrecuentes: false, cantidadFrecuentes: 0 };

  test('sin frecuentes que coincidan con lo escrito: sí', () => {
    assert.equal(debeConsultarGoogle(base), true);
  });

  test('con alguna frecuente que coincide: no (salvo que lo pida el usuario)', () => {
    assert.equal(debeConsultarGoogle({ ...base, cantidadFrecuentes: 1 }), false);
    assert.equal(debeConsultarGoogle({ ...base, cantidadFrecuentes: 1, forzado: true }), true);
  });

  test('mientras se buscan las frecuentes, o si la respuesta es de otro texto: no', () => {
    assert.equal(debeConsultarGoogle({ ...base, buscandoFrecuentes: true }), false);
    assert.equal(debeConsultarGoogle({ ...base, texto: 'monserrat 2' }), false);
    assert.equal(debeConsultarGoogle({ ...base, textoFrecuentes: undefined }), false);
  });

  test('menos de 3 letras: nunca, ni forzado', () => {
    assert.equal(debeConsultarGoogle({ ...base, texto: 'mo', textoFrecuentes: 'mo' }), false);
    assert.equal(debeConsultarGoogle({ ...base, texto: 'mo', forzado: true }), false);
  });
});

describe('frecuenteExistenteDe (409 por nombre repetido)', () => {
  test('devuelve la existente de un 409; null para cualquier otro error', () => {
    const existente = { id: 7, nombre: 'Hotel Sierras' };
    assert.deepEqual(frecuenteExistenteDe({ response: { status: 409, data: { error: '…', frecuenteExistente: existente } } }), existente);
    assert.equal(frecuenteExistenteDe({ response: { status: 409, data: { error: 'ya está ubicada' } } }), null);
    assert.equal(frecuenteExistenteDe({ response: { status: 429, data: {} } }), null);
    assert.equal(frecuenteExistenteDe(new Error('Network Error')), null);
  });
});

describe('ofrecerCrearPorNombre (plan B sin Google)', () => {
  test('si Google falló (sin key, tope, caído) y hay texto: sí', () => {
    assert.equal(ofrecerCrearPorNombre({ texto: 'Escuela Carbó', errorGoogle: 'Se alcanzó el límite diario…' }), true);
    assert.equal(ofrecerCrearPorNombre({ texto: 'Escuela Carbó', errorEleccion: { mensaje: 'falta configurar…' } }), true);
  });

  test('con Google andando, sin texto o con un conflicto de nombre: no', () => {
    assert.equal(ofrecerCrearPorNombre({ texto: 'Escuela Carbó' }), false);
    assert.equal(ofrecerCrearPorNombre({ texto: '  ', errorGoogle: 'caído' }), false);
    assert.equal(ofrecerCrearPorNombre({ texto: 'Hotel', errorEleccion: { mensaje: 'Ya hay…', frecuenteExistente: { id: 1 } } }), false);
  });
});
