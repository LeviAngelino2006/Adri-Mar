// Lógica del botón "Calcular km" del formulario de viaje (sin React, para
// poder testearla con node:test). El cálculo lo hace el backend con
// OpenRouteService (POST /viajes/estimar-km) a partir de los ids del recorrido.

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
// { error } (ORS: no encontrada, cuota, timeout…) o { errores } por campo
// (recorrido inválido).
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

// Por qué un punto merece revisión, en palabras para el encargado. Los códigos
// los decide el backend (utils/revisionGeocodificacion.js); uno desconocido se
// muestra igual con un texto genérico, para no esconder el aviso.
const TEXTOS_MOTIVOS_REVISION = {
  CALLE: 'se ubicó en una calle, no en una localidad o un lugar',
  NOMBRE_DISTINTO: 'el lugar encontrado tiene otro nombre',
  OTRA_PROVINCIA: 'quedó fuera de la provincia de Córdoba',
};

export function textoMotivosRevision(motivos = []) {
  return motivos.map((m) => TEXTOS_MOTIVOS_REVISION[m] ?? 'conviene verificarla en el mapa').join('; ');
}

// 45 → "45 min"; 91 → "1 h 31 min"; 120 → "2 h".
export function formatearDuracion(minutos) {
  if (!Number.isFinite(minutos) || minutos < 60) return `${Math.max(0, Math.round(minutos || 0))} min`;
  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
