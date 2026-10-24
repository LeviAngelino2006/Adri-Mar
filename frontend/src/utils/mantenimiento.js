import { formatearKm } from './viajeFormato.js';
import { ordenarPorInterno } from './vehiculos.js';

// Funciones puras de la pantalla de Mantenimiento: filtro y orden de la
// pestaña Service (son pocos vehículos: se filtra en el front), validación de
// los formularios y los textos de las tarjetas.

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Interno, dominio, marca o modelo.
export function coincideBusquedaVehiculo(vehiculo, busqueda) {
  const q = normalizar(busqueda).trim();
  if (!q) return true;
  return [vehiculo.numeroInterno, vehiculo.dominio, vehiculo.marca, vehiculo.modelo].some((campo) =>
    normalizar(campo).includes(q)
  );
}

export function filtrarEstadoService(items, { busqueda = '', estado = '', tipoVehiculoId = '' } = {}) {
  return items.filter(
    (item) =>
      coincideBusquedaVehiculo(item.vehiculo, busqueda) &&
      (!estado || item.estado === estado) &&
      (!tipoVehiculoId || String(item.vehiculo.tipoVehiculoId) === String(tipoVehiculoId))
  );
}

// Posición de cada vehículo por número de interno (orden natural), para
// desempatar los demás órdenes.
function posicionesPorInterno(items) {
  const ordenados = ordenarPorInterno(items.map((item) => item.vehiculo));
  return new Map(ordenados.map((vehiculo, indice) => [vehiculo.id, indice]));
}

// urgencia (por defecto): fracción del intervalo recorrida, de mayor a menor
//   (900 km restantes son el 4,5 % de un colectivo pero el 9 % de un
//   utilitario), con los SIN_PLAN al final.
// interno: número de interno, orden natural.
// tipo: tipo de vehículo y, dentro de cada uno, interno.
// km: km desde el último service, de mayor a menor (SIN_PLAN al final).
export function ordenarEstadoService(items, orden = 'urgencia') {
  const posicion = posicionesPorInterno(items);
  const porInterno = (a, b) => posicion.get(a.vehiculo.id) - posicion.get(b.vehiculo.id);
  const sinPlanAlFinal = (a, b) => Number(a.estado === 'SIN_PLAN') - Number(b.estado === 'SIN_PLAN');
  const comparadores = {
    urgencia: (a, b) =>
      sinPlanAlFinal(a, b) || (b.porcentajeConsumido ?? 0) - (a.porcentajeConsumido ?? 0) || porInterno(a, b),
    interno: porInterno,
    tipo: (a, b) =>
      String(a.vehiculo.tipoVehiculo).localeCompare(String(b.vehiculo.tipoVehiculo), 'es') || porInterno(a, b),
    km: (a, b) => sinPlanAlFinal(a, b) || (b.kmDesdeService ?? 0) - (a.kmDesdeService ?? 0) || porInterno(a, b),
  };
  return [...items].sort(comparadores[orden] ?? comparadores.urgencia);
}

// Vencidos + próximos: el contador de la pestaña Service.
export function contarAlertas(items) {
  return items.filter((item) => item.estado === 'VENCIDO' || item.estado === 'PROXIMO').length;
}

// "Próximo service a los 340.000 km · faltan 800 km" / "· pasado por 1.200 km".
export function detalleEstadoService(item) {
  if (item.estado === 'SIN_PLAN') return 'Sin plan de service: asignale uno para seguir sus kilómetros.';
  const base = `Próximo service a los ${formatearKm(item.kmProximoService)} km`;
  if (item.kmExcedidos > 0) return `${base} · pasado por ${formatearKm(item.kmExcedidos)} km`;
  if (item.kmRestantes === 0) return `${base} · le toca ahora`;
  return `${base} · faltan ${formatearKm(item.kmRestantes)} km`;
}

// "Colectivo · service cada 20.000 km".
export function textoIntervalo(item) {
  const tipo = item.vehiculo.tipoVehiculo ?? 'Vehículo';
  return item.plantilla ? `${tipo} · service cada ${formatearKm(item.plantilla.intervaloKm)} km` : tipo;
}

// "12 - AE452KD · Mercedes O500", para los <option> (el texto no admite `.patente`).
export function etiquetaVehiculo(vehiculo) {
  return `${vehiculo.numeroInterno} - ${vehiculo.dominio} · ${vehiculo.marca} ${vehiculo.modelo}`;
}

// Línea principal de un registro del historial: la descripción o la observación.
export function textoRegistro(registro) {
  if (registro.tipo === 'SERVICE') return registro.observaciones || 'Service completo';
  // Sin descripción ni observación, el "¿Qué trabajo?" de "Otro": el badge lo
  // corta con "…" y en el celular no hay title para leerlo entero.
  const detalles = (registro.tiposArreglo ?? []).map((t) => t.detalle).filter(Boolean);
  return registro.descripcion || registro.observaciones || detalles.join(', ') || 'Sin descripción';
}

// Cómo se muestra un tipo de un arreglo: lo que se hizo, si el tipo lo pide
// ("Otro" → "Cambio de espejo"), o su nombre. Un "Otro" cargado antes de que
// existiera el detalle se muestra como "Otro".
export function nombreTipoArreglo(tipo) {
  return tipo.detalle || tipo.nombre;
}

// Datos secundarios de un registro que no entraron en la línea principal.
// Con 2 tipos o más, la lista completa ("Trabajos: …"); con 1 ya está en el badge.
export function detalleRegistro(registro) {
  const partes = [];
  const tipos = registro.tiposArreglo ?? [];
  if (tipos.length > 1) partes.push(`Trabajos: ${tipos.map(nombreTipoArreglo).join(', ')}`);
  if (registro.repuestos) partes.push(`Repuestos: ${registro.repuestos}`);
  if (registro.tipo === 'ARREGLO' && registro.descripcion && registro.observaciones) {
    partes.push(`Observaciones: ${registro.observaciones}`);
  }
  return partes.join(' · ');
}

// "57.345 km · Hizo: Taller Gómez".
export function pieRegistro(registro) {
  const km = `${formatearKm(registro.kilometraje)} km`;
  return registro.responsable ? `${km} · Hizo: ${registro.responsable}` : km;
}

const largo = (texto) => [...String(texto ?? '')].length;

// Validación previa de los formularios de service y arreglo (el backend valida
// igual). Devuelve { campo: mensaje } con todos los errores juntos.
// `hoy` es el día de Córdoba ("YYYY-MM-DD"); `tiposArreglo` (los tipos
// marcados, con `requiereDetalle`) solo en arreglos: los que lo piden necesitan
// su "¿Qué trabajo?" en `form.detallesTipos[id]`.
export function validarRegistroMantenimiento(
  form,
  { hoy, esArreglo = false, tiposArreglo = [], maxTexto, maxResponsable, maxDetalleTipo }
) {
  const errores = {};
  if (!form.vehiculoId) errores.vehiculoId = 'Elegí el vehículo';
  if (esArreglo && !form.tiposArregloIds?.length) errores.tiposArregloIds = 'Elegí al menos un tipo de trabajo';
  if (!form.fecha) errores.fecha = 'Indicá la fecha';
  else if (form.fecha > hoy) errores.fecha = 'La fecha no puede ser posterior a hoy';

  const km = String(form.kilometraje ?? '').trim();
  if (!km) errores.kilometraje = 'Indicá el km del odómetro';
  else if (!/^\d+$/.test(km)) errores.kilometraje = 'Tiene que ser un número entero, sin puntos';

  const textos = esArreglo ? ['descripcion', 'repuestos', 'observaciones'] : ['observaciones'];
  for (const campo of textos) {
    if (largo(form[campo]) > maxTexto) errores[campo] = `Hasta ${maxTexto} caracteres`;
  }
  if (esArreglo && largo(form.responsable) > maxResponsable) errores.responsable = `Hasta ${maxResponsable} caracteres`;
  for (const tipo of esArreglo ? tiposArreglo.filter((t) => t.requiereDetalle) : []) {
    const detalle = String(form.detallesTipos?.[tipo.id] ?? '').trim();
    if (!detalle) errores.detallesTipos = `Contá qué trabajo se hizo (obligatorio para "${tipo.nombre}")`;
    else if (largo(detalle) > maxDetalleTipo) errores.detallesTipos = `Hasta ${maxDetalleTipo} caracteres`;
    if (errores.detallesTipos) break;
  }
  return errores;
}

// Badge del historial: 1 o 2 tipos por nombre ("Engrase + Frenos", en el orden
// del catálogo, como los devuelve el backend); desde 3, "N trabajos", así no se
// estira. La lista completa va en el detalle (detalleRegistro).
export function textoTiposArreglo(registro) {
  const tipos = registro.tiposArreglo ?? [];
  if (tipos.length === 0) return 'Arreglo';
  if (tipos.length >= 3) return `${tipos.length} trabajos`;
  return tipos.map(nombreTipoArreglo).join(' + ');
}

// Advertencia del formulario de viaje (GET /mantenimientos/evaluar-viaje).
export function textoAdvertenciaViaje(advertencia) {
  const proximo = formatearKm(advertencia.kmProximoService);
  if (advertencia.yaVencido) {
    return `Este vehículo ya pasó su service: le tocaba a los ${proximo} km y lleva ${formatearKm(advertencia.kmExcedidos)} km de más.`;
  }
  return `Con este viaje el vehículo llegaría a los ${formatearKm(advertencia.kmFinalEstimado)} km y pasaría su service, que le toca a los ${proximo} km (faltan ${formatearKm(advertencia.kmRestantes)} km).`;
}
