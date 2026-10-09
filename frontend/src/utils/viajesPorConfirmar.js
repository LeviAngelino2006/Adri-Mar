// Agrupa los viajes A confirmar que hay que resolver HOY y MAÑANA (días de
// Córdoba) para el panel del Dashboard. Los de días anteriores no entran (el
// panel no es una lista de atrasados) y tampoco los de más adelante.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { fechaCordobaISO, hoyCordobaISO, mananaCordobaISO } from './fechaCordoba.js';

export function agruparPorConfirmar(viajes, ahora = Date.now()) {
  const hoy = hoyCordobaISO(ahora);
  const manana = mananaCordobaISO(ahora);

  const delDia = (dia) =>
    viajes
      .filter((viaje) => viaje.fechaInicio && fechaCordobaISO(viaje.fechaInicio) === dia)
      // Los más tempranos primero: es el orden en que hay que atenderlos.
      .sort((a, b) => new Date(a.fechaInicio) - new Date(b.fechaInicio));

  return { hoy: delDia(hoy), manana: delDia(manana) };
}

// Rango de fechas ("YYYY-MM-DD", de Córdoba) para pedirle al backend solo lo que
// el panel muestra: el día de hoy y el de mañana, en una sola consulta.
export function rangoHoyYManana(ahora = Date.now()) {
  return { fechaDesde: hoyCordobaISO(ahora), fechaHasta: mananaCordobaISO(ahora) };
}
