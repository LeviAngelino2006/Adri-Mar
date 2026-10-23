// Un viaje de la API como valores iniciales de ViajeForm: para editarlo o para
// duplicarlo. Funciones puras, sin React, para poder probarlas con node:test.

import { aInputCordoba } from './fechaCordoba.js';
import { paradasDesdeViaje } from './paradas.js';
import { lugarDe } from './sugerenciasGoogle.js';
import { formatearFechaCorta } from './viajeFormato.js';

export function viajeAValoresForm(viaje) {
  return {
    clienteId: viaje.clienteId || '',
    clienteNombre: viaje.cliente?.nombre || '',
    choferId: viaje.choferId || '',
    vehiculoId: viaje.vehiculoId || '',
    choferesCandidatos: (viaje.choferesCandidatos ?? []).map((c) => c.id),
    vehiculosCandidatos: (viaje.vehiculosCandidatos ?? []).map((c) => c.id),
    origenId: viaje.origenId || '',
    origenNombre: viaje.origen?.nombre || '',
    destinoId: viaje.destinoId || '',
    destinoNombre: viaje.destino?.nombre || '',
    origenLugar: lugarDe(viaje.origen),
    destinoLugar: lugarDe(viaje.destino),
    paradas: paradasDesdeViaje(viaje),
    fechaInicio: aInputCordoba(viaje.fechaInicio),
    fechaFin: aInputCordoba(viaje.fechaFin),
    kilometrosEstimados: viaje.kilometrosEstimados ?? '',
    cantidadPasajeros: viaje.cantidadPasajeros ?? '',
  };
}

// Duplicar: el alta de un viaje nuevo precargada con el cliente, el recorrido
// (origen, paradas en orden y destino), las fechas y los km estimados del
// original. Pasajeros, choferes y vehículos quedan vacíos porque dependen de la
// unidad (otro micro, otro chofer). Precio, pagos, estado, odómetros, horas
// reales y observación final no son campos del formulario, así que tampoco se
// copian. El original no se toca: al guardar se hace un POST como cualquier alta.
//
// Si el original ya empezó (su inicio es anterior a `ahora`), inicio y fin
// quedan vacíos: copiarlos crearía un viaje en el pasado si nadie los cambia.
// Se comparan instantes, así que da lo mismo que en hora de Córdoba; un viaje
// de hoy más tarde todavía no empezó y se copia con sus fechas.
export function valoresParaDuplicar(viaje, ahora = Date.now()) {
  const fechas = fechaYaPaso(viaje, ahora) ? { fechaInicio: '', fechaFin: '' } : {};
  return {
    ...viajeAValoresForm(viaje),
    choferId: '',
    vehiculoId: '',
    choferesCandidatos: [],
    vehiculosCandidatos: [],
    cantidadPasajeros: '',
    ...fechas,
  };
}

function fechaYaPaso(viaje, ahora) {
  return Boolean(viaje.fechaInicio) && new Date(viaje.fechaInicio).getTime() < ahora;
}

// Línea que va arriba del formulario al duplicar: "Duplicado del viaje del
// 09 oct 2026 a Córdoba. …". Un viaje histórico puede no tener fecha o destino.
// Con el mismo `ahora` que valoresParaDuplicar: si las fechas se vaciaron, pide
// elegir una.
export function avisoDuplicado(viaje, ahora = Date.now()) {
  const fecha = viaje.fechaInicio ? ` del ${formatearFechaCorta(viaje.fechaInicio)}` : '';
  const destino = viaje.destino?.nombre ? ` a ${viaje.destino.nombre}` : '';
  const pedido = fechaYaPaso(viaje, ahora)
    ? 'Elegí la fecha nueva y revisá pasajeros y unidad antes de crear.'
    : 'Revisá fecha, pasajeros y unidad antes de crear.';
  return `Duplicado del viaje${fecha}${destino}. ${pedido}`;
}
