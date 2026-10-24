// Viajes del panel "Viajes de hoy" del Dashboard (Administrador y Encargado):
// solo los de hoy. Los de días anteriores que siguen abiertos ("sin cerrar") van
// en su propio panel (ver viajesSinCerrar.js), no acá.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { hoyCordobaISO } from './fechaCordoba.js';

const EXCLUIDOS = ['A_CONFIRMAR', 'CANCELADO'];

// Lo que se le pide al backend (GET /viajes acepta un solo estado, por eso son
// dos consultas):
//  1. Los que empiezan hoy, en cualquier estado (también los Finalizados de hoy).
//     El backend interpreta una fecha suelta como el día entero de Córdoba, de
//     00:00 a 23:59:59.999.
//  2. Todos los En viaje, con vista=proximos: uno que se comenzó antes de su día
//     no tiene que perderse, y la vista marca con `sinCerrar` al que empezó un
//     día anterior, que no es de hoy (está en el panel Sin cerrar).
export function consultasViajesDeHoy(ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  return [{ fechaDesde: hoy, fechaHasta: hoy }, { vista: 'proximos', estado: 'EN_VIAJE' }];
}

// Une las respuestas sin duplicados (si alguna copia de un viaje viene marcada
// `sinCerrar`, queda esa), saca los A confirmar, los Cancelados y los sin cerrar
// (lo decide el backend: acá no se recalcula) y ordena por salida, del más
// temprano al más tarde.
export function unirViajesDeHoy(...listas) {
  const porId = new Map();
  for (const viaje of listas.flat()) {
    if (!porId.has(viaje.id) || viaje.sinCerrar) porId.set(viaje.id, viaje);
  }
  return [...porId.values()]
    .filter((viaje) => !viaje.sinCerrar && !EXCLUIDOS.includes(viaje.estado))
    .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio));
}

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

// "5 viajes · 1 en viaje · 2 finalizados". Las partes en cero se omiten, salvo el
// total.
export function resumenViajesDeHoy(viajes) {
  const contar = (estado) => viajes.filter((viaje) => viaje.estado === estado).length;
  const enViaje = contar('EN_VIAJE');
  const finalizados = contar('FINALIZADO');

  const partes = [plural(viajes.length, 'viaje', 'viajes')];
  if (enViaje > 0) partes.push(`${enViaje} en viaje`);
  if (finalizados > 0) partes.push(plural(finalizados, 'finalizado', 'finalizados'));
  return partes.join(' · ');
}
