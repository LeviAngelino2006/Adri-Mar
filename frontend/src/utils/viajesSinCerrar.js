// Panel "Sin cerrar" del Dashboard (Administrador y Encargado): los viajes de días
// anteriores que siguen abiertos (A confirmar, Programado o En viaje). Qué es "sin
// cerrar" lo decide el backend (GET /viajes?vista=proximos marca cada viaje con
// `sinCerrar`): acá no se recalcula, para que el listado de Viajes y el Dashboard
// digan siempre lo mismo.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { fechaCordobaISO, hoyCordobaISO } from './fechaCordoba.js';
import { formatearHora, tituloDiaViajes } from './viajeFormato.js';

// Cuántos se muestran en el panel; el resto, con "Ver todos" en Viajes.
export const MAX_SIN_CERRAR = 5;

// Lo que se le pide al backend: la vista Próximos hasta hoy. Los sin cerrar son
// todos de días anteriores, así que no hace falta traer los viajes futuros.
export function consultaSinCerrar(ahora = Date.now()) {
  return { vista: 'proximos', fechaHasta: hoyCordobaISO(ahora) };
}

// Los que el backend marcó con `sinCerrar`, del más viejo al más nuevo (el
// backend ya los manda así; el orden se asegura acá igual).
export function viajesSinCerrar(viajes) {
  return viajes
    .filter((viaje) => viaje.sinCerrar)
    .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio));
}

// "1 viaje", "7 viajes": la cantidad total, en el encabezado del panel.
export function textoCantidadSinCerrar(cantidad) {
  return `${cantidad} ${cantidad === 1 ? 'viaje' : 'viajes'}`;
}

// La fecha de la fila: "Ayer · vie 23 oct · 08:00", "mié 21 oct · 13:00". Sin
// color ni nada que marque el atraso: el día alcanza.
export function fechaFilaSinCerrar(viaje, ahora = Date.now()) {
  return `${tituloDiaViajes(fechaCordobaISO(viaje.fechaInicio), ahora)} · ${formatearHora(viaje.fechaInicio)}`;
}
