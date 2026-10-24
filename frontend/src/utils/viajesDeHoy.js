// Viajes del panel "Viajes de hoy" del Dashboard (Administrador y Encargado):
// los de hoy y, arriba, los "sin cerrar" (de días anteriores que siguen abiertos).
// Qué es "sin cerrar" lo decide el backend (GET /viajes?vista=proximos marca cada
// viaje con `sinCerrar`): acá no se recalcula, para que el listado de Viajes y el
// Dashboard digan siempre lo mismo.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { hoyCordobaISO } from './fechaCordoba.js';

const EXCLUIDOS = ['A_CONFIRMAR', 'CANCELADO'];

// Lo que se le pide al backend (GET /viajes acepta un solo estado, por eso son
// tres consultas):
//  1. Los abiertos hasta hoy con vista=proximos: los sin cerrar, ya marcados, y
//     los de hoy que siguen abiertos.
//  2. Todos los En viaje, también con vista=proximos (marcados): uno que se
//     comenzó antes de su día no tiene que perderse.
//  3. Los que empiezan hoy, en cualquier estado, por los Finalizados de hoy. El
//     backend interpreta una fecha suelta como el día entero de Córdoba, de 00:00
//     a 23:59:59.999.
export function consultasViajesDeHoy(ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  return [
    { vista: 'proximos', fechaHasta: hoy },
    { vista: 'proximos', estado: 'EN_VIAJE' },
    { fechaDesde: hoy, fechaHasta: hoy },
  ];
}

// Une las respuestas sin duplicados (queda la primera vez que aparece cada
// viaje: las consultas con vista van primero, así queda la copia con
// `sinCerrar`), saca de los de hoy los A confirmar y los Cancelados y ordena por
// salida, del más temprano al más tarde. Un A confirmar sin cerrar sí queda: es
// un viaje atrasado que nadie resolvió.
export function unirViajesDeHoy(...listas) {
  const porId = new Map();
  for (const viaje of listas.flat()) {
    if (!porId.has(viaje.id)) porId.set(viaje.id, viaje);
  }
  return [...porId.values()]
    .filter((viaje) => viaje.sinCerrar || !EXCLUIDOS.includes(viaje.estado))
    .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio));
}

// { sinCerrar, deHoy } de la lista ya unida, en el mismo orden. Un En viaje que
// empezó ayer está solo en `sinCerrar`.
export function separarSinCerrar(viajes) {
  return {
    sinCerrar: viajes.filter((viaje) => viaje.sinCerrar),
    deHoy: viajes.filter((viaje) => !viaje.sinCerrar),
  };
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
