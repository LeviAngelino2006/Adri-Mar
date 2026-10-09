// Viajes del panel "Viajes de hoy" del Dashboard (Administrador y Encargado).
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { hoyCordobaISO } from './fechaCordoba.js';

const EXCLUIDOS = ['A_CONFIRMAR', 'CANCELADO'];

// Lo que se le pide al backend: los viajes que empiezan hoy (día de Córdoba; el
// backend interpreta una fecha suelta como el día entero de Córdoba, de 00:00 a
// 23:59:59.999) y, aparte, todos los En viaje, para no perder uno que salió ayer.
export function consultasViajesDeHoy(ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  return [{ fechaDesde: hoy, fechaHasta: hoy }, { estado: 'EN_VIAJE' }];
}

// Une las dos respuestas sin duplicados, saca los A confirmar y los Cancelados y
// ordena por salida, del más temprano al más tarde.
export function unirViajesDeHoy(...listas) {
  const porId = new Map();
  for (const viaje of listas.flat()) {
    if (!porId.has(viaje.id)) porId.set(viaje.id, viaje);
  }
  return [...porId.values()]
    .filter((viaje) => !EXCLUIDOS.includes(viaje.estado))
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
