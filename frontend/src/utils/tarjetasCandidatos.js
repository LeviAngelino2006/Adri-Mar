// Contenido de las tarjetas de choferes y vehículos posibles (TarjetaSeleccionable):
// título, detalles y estado de habilitación. Funciones puras: NO deciden quién es
// elegible ni validan la documentación; solo muestran lo que ya trae cada item
// (`disponible` / `motivo`, que vienen del backend o de la disponibilidad).
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

import { nombreChofer } from './viajeFormato.js';

export const TEXTO_HABILITADO = 'Habilitado';
export const TEXTO_NO_HABILITADO = 'No habilitado';

const hayDato = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== '';

// { texto, tono } del estado de habilitación. `disponible === false` es lo único
// que deshabilita (sin la clave, o en true, está habilitado), con el mismo
// criterio que usaban los chips.
export function estadoHabilitacion(item) {
  if (item?.disponible === false) {
    return { texto: hayDato(item.motivo) ? item.motivo : TEXTO_NO_HABILITADO, tono: 'error' };
  }
  return { texto: TEXTO_HABILITADO, tono: 'ok' };
}

// Chofer: nombre completo y estado de habilitación.
export function tarjetaChofer(chofer) {
  return {
    id: chofer.id,
    titulo: nombreChofer(chofer),
    detalles: [],
    estado: estadoHabilitacion(chofer),
    deshabilitada: chofer.disponible === false,
  };
}

// "1 asiento" / "45 asientos"; null si el dato no está.
export function textoAsientos(asientos) {
  if (!hayDato(asientos) || !Number.isFinite(Number(asientos))) return null;
  const cantidad = Number(asientos);
  return `${cantidad} ${cantidad === 1 ? 'asiento' : 'asientos'}`;
}

// Vehículo: interno, patente y cantidad de asientos si el dato existe, más el
// estado de habilitación.
export function tarjetaVehiculo(vehiculo) {
  return {
    id: vehiculo.id,
    titulo: `Interno ${vehiculo.numeroInterno}`,
    detalles: [hayDato(vehiculo.dominio) ? `Patente ${vehiculo.dominio}` : null, textoAsientos(vehiculo.asientos)].filter(
      Boolean
    ),
    estado: estadoHabilitacion(vehiculo),
    deshabilitada: vehiculo.disponible === false,
  };
}
