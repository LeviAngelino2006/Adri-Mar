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
export function valoresParaDuplicar(viaje) {
  return {
    ...viajeAValoresForm(viaje),
    choferId: '',
    vehiculoId: '',
    choferesCandidatos: [],
    vehiculosCandidatos: [],
    cantidadPasajeros: '',
  };
}

// Línea que va arriba del formulario al duplicar: "Duplicado del viaje del
// 09 oct 2026 a Córdoba. …". Un viaje histórico puede no tener fecha o destino.
export function avisoDuplicado(viaje) {
  const fecha = viaje.fechaInicio ? ` del ${formatearFechaCorta(viaje.fechaInicio)}` : '';
  const destino = viaje.destino?.nombre ? ` a ${viaje.destino.nombre}` : '';
  return `Duplicado del viaje${fecha}${destino}. Revisá fecha, pasajeros y unidad antes de crear.`;
}
