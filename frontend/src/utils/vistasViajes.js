// Vistas Próximos | Anteriores de los listados de viajes (Viajes y Mis viajes):
// la vista va en la URL (?tab=anteriores) y cada vista tiene sus estados.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { ESTADOS_VIAJE } from '../constants/estadosViaje.js';

export const OPCIONES_VISTA = [
  { valor: 'proximos', etiqueta: 'Próximos' },
  { valor: 'anteriores', etiqueta: 'Anteriores' },
];

// La vista sale de la URL (?tab=anteriores); cualquier otro valor es Próximos.
export const vistaDeLaUrl = (valor) => (valor === 'anteriores' ? 'anteriores' : 'proximos');

// Lo que va en la URL para una vista (para setSearchParams).
export const parametrosDeVista = (vista) => (vista === 'anteriores' ? { tab: 'anteriores' } : {});

// Estados de cada vista del listado de Viajes (gestión). Es el mismo corte que
// hace el backend con GET /viajes?vista= (viajeService, VISTAS_LISTADO): los
// abiertos son Próximos y los cerrados, Anteriores.
export const VISTAS_VIAJES = {
  proximos: ['A_CONFIRMAR', 'PROGRAMADO', 'EN_VIAJE'],
  anteriores: ['FINALIZADO', 'CANCELADO'],
};

// La vista del listado de Viajes donde está un viaje con ese estado.
export const vistaDelEstado = (estado) => (VISTAS_VIAJES.anteriores.includes(estado) ? 'anteriores' : 'proximos');

// Los argumentos de navigate() para abrir la ficha de un viaje desde otra
// pantalla (los paneles del Dashboard): el listado de Viajes en la vista de su
// estado (un Finalizado, en Anteriores, para que la ficha lo encuentre) y el id
// en el state. Uso: navigate(...destinoFichaViaje(viaje)).
export function destinoFichaViaje(viaje) {
  const search = new URLSearchParams(parametrosDeVista(vistaDelEstado(viaje.estado))).toString();
  return [{ pathname: '/viajes', search }, { state: { viajeId: viaje.id } }];
}

// Opciones del filtro de estado: "Todos" y los estados de la vista.
export const opcionesDeEstado = (estados) => [
  { value: '', label: 'Todos' },
  ...estados.map((estado) => ({ value: estado, label: ESTADOS_VIAJE[estado].label })),
];

// Al cambiar de vista, un estado que no es de la nueva (Cancelado al pasar a
// Próximos) se limpia: si no, la vista quedaría vacía por un filtro que ya no se
// ve. Devuelve los mismos filtros si no hay nada que cambiar.
export function filtrosParaLaVista(filtros, estados) {
  return filtros.estado && !estados.includes(filtros.estado) ? { ...filtros, estado: '' } : filtros;
}

// Próximos del listado de Viajes, como los manda el backend (ya ordenados): los
// sin cerrar (el backend los marca con `sinCerrar`), los En viaje y el resto, que
// se agrupa por día.
export function separarProximos(viajes) {
  const sinCerrar = viajes.filter((v) => v.sinCerrar);
  const abiertos = viajes.filter((v) => !v.sinCerrar);
  return {
    sinCerrar,
    enCurso: abiertos.filter((v) => v.estado === 'EN_VIAJE'),
    resto: abiertos.filter((v) => v.estado !== 'EN_VIAJE'),
  };
}
