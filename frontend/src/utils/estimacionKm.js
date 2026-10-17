// Lógica del botón "Calcular km" del formulario de viaje (sin React, para
// poder testearla con node:test). El cálculo lo hace el backend con
// OpenRouteService (POST /viajes/estimar-km) a partir de los ids del recorrido
// y las coordenadas guardadas de cada ubicación.

// Ids del recorrido tal como los tiene el formulario. Las filas de parada sin
// ubicación elegida se ignoran, igual que en el link de Google Maps
// (BotonVerRecorrido): así lo que se calcula es lo que se ve en el mapa.
export function idsDelRecorrido({ origenId, destinoId, paradas = [] }) {
  return {
    origenId: origenId || null,
    paradaIds: paradas.map((p) => p?.id).filter(Boolean),
    destinoId: destinoId || null,
  };
}

// Solo hace falta origen y destino (las paradas son opcionales).
export function puedeCalcularKm(ids) {
  return Boolean(ids.origenId && ids.destinoId);
}

// Texto que identifica un recorrido: si cambia el origen, el destino o las
// paradas (o su orden), cambia la firma y el cálculo anterior queda
// desactualizado.
export function firmaRecorrido({ origenId, paradaIds, destinoId }) {
  return [origenId, ...paradaIds, destinoId].map((id) => id ?? '').join('>');
}

// Mensaje para el usuario a partir del error de axios. El backend manda
// { error } (ubicación sin coordenadas, cuota, timeout…) o { errores } por
// campo (recorrido inválido).
export function mensajeErrorEstimacion(err) {
  const datos = err?.response?.data;
  if (datos?.error) return datos.error;
  if (datos?.errores) {
    const mensajes = Object.values(datos.errores).filter(Boolean);
    if (mensajes.length > 0) return mensajes.join('. ');
  }
  if (!err?.response) return 'No se pudo conectar con el servidor para calcular los km.';
  return 'No se pudieron calcular los km. Cargalos a mano.';
}

// Lo que hace "Calcular km" con el formulario: completa el campo con el total
// redondeado. Sigue siendo un input común, editable a mano después.
export function aplicarEstimacion(form, resultado) {
  return { ...form, kilometrosEstimados: String(resultado.kilometros) };
}

// Ubicaciones del recorrido que todavía no están en el mapa, según el 422 del
// backend: [{ ubicacionId, nombre }] (vacío para cualquier otro error).
export function ubicacionesSinCoordenadas(err) {
  const lista = err?.response?.status === 422 ? err.response.data?.ubicacionesSinCoordenadas : null;
  return Array.isArray(lista) ? lista : [];
}

// Mismo texto que el backend (estimacionRecorridoService.errorSinCoordenadas).
export function mensajeSinCoordenadas(faltantes) {
  const nombres = faltantes.map((u) => `"${u.nombre}"`);
  return faltantes.length === 1
    ? `Falta ubicar ${nombres[0]} en el mapa.`
    : `Faltan ubicar en el mapa: ${nombres.join(', ')}.`;
}

// Después de ubicar una en el mapa: el error sin esa ubicación, o null si ya
// no falta ninguna (entonces se puede volver a calcular).
export function quitarFaltante(errorKm, ubicacionId) {
  const faltantes = (errorKm?.faltantes ?? []).filter((u) => u.ubicacionId !== ubicacionId);
  if (faltantes.length === 0) return null;
  return { ...errorKm, faltantes, mensaje: mensajeSinCoordenadas(faltantes) };
}

// 45 → "45 min"; 91 → "1 h 31 min"; 120 → "2 h".
export function formatearDuracion(minutos) {
  if (!Number.isFinite(minutos) || minutos < 60) return `${Math.max(0, Math.round(minutos || 0))} min`;
  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
