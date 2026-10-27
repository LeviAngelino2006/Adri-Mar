// Helpers puros de los presupuestos (formulario, listado, ficha y PDF). Los
// imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.
import { hoyCordobaISO, sumarDiasFechaISO } from './fechaCordoba.js';
import { formatearFechaCorta } from './viajeFormato.js';
import { aCentavos, centavosAImporteIngresado, centavosAString, importeIngresadoACentavos } from './importes.js';
import {
  DIAS_VALIDEZ_MAX,
  DIAS_VALIDEZ_MIN,
  DIAS_VALIDEZ_POR_DEFECTO,
  FORMA_PAGO_POR_DEFECTO,
  HORARIO_A_CONFIRMAR,
} from '../constants/presupuesto.js';

const FECHA_ISO_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

// Las fechas del presupuesto son días calendario ("YYYY-MM-DD"), sin hora. Para
// formatearlas se usa el mediodía UTC de ese día, que en Córdoba (UTC-3) es el
// mismo día: así no se corren de fecha.
const mediodiaUTC = (fechaISO) => `${fechaISO}T12:00:00Z`;

// "2026-10-12" → "12 oct 2026", el formato de fechas de la app.
export function formatearFechaPresupuesto(fechaISO) {
  return fechaISO ? formatearFechaCorta(mediodiaUTC(fechaISO)) : null;
}

// "2026-10-12" → "12/10/2026", el formato del PDF (es un documento para el
// cliente, como el Word original).
export function formatearFechaDocumento(fechaISO) {
  const [, anio, mes, dia] = FECHA_ISO_REGEX.exec(fechaISO);
  return `${dia}/${mes}/${anio}`;
}

// Días de validez como entero entre 1 y 365, o null si no lo es (mismo rango
// que valida el backend).
export function diasValidezValidos(dias) {
  const texto = String(dias ?? '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return numero >= DIAS_VALIDEZ_MIN && numero <= DIAS_VALIDEZ_MAX ? numero : null;
}

// Último día de validez: fecha de emisión + días. null si falta algún dato o
// no es válido (el formulario no muestra nada mientras tanto).
export function fechaVencimiento(fechaEmision, diasValidez) {
  const dias = diasValidezValidos(diasValidez);
  if (!fechaEmision || !FECHA_ISO_REGEX.test(fechaEmision) || dias === null) return null;
  return sumarDiasFechaISO(fechaEmision, dias);
}

export function textoHorario(horaSalida) {
  return horaSalida || HORARIO_A_CONFIRMAR;
}

// Etiqueta y detalle de un vehículo en el selector de unidades: "12 · AB123CD"
// y el texto que va a salir en el PDF ("Minibus de 17 pasajeros"). El texto es
// el mismo que arma el backend al guardar (presupuestoService.describirUnidad).
export function opcionUnidad(vehiculo) {
  return {
    id: vehiculo.id,
    etiqueta: `${vehiculo.numeroInterno} · ${vehiculo.dominio}`,
    detalle: `${vehiculo.tipoVehiculo.descripcion} de ${vehiculo.asientos} pasajeros`,
  };
}

// Caracteres que Windows (el más restrictivo) no acepta en un nombre de archivo,
// más los de control.
// eslint-disable-next-line no-control-regex
const CARACTERES_INVALIDOS = /[<>:"/\\|?*\u0000-\u001f]/g;

// "Presupuesto - Club Acción Juvenil - 12-10-2026.pdf". Se conservan tildes y
// eñes (todos los sistemas las aceptan) y se sacan los caracteres inválidos,
// los espacios repetidos y los puntos o espacios del final.
export function nombreArchivoPresupuesto(presupuesto) {
  const cliente =
    presupuesto.cliente.nombre
      .replace(CARACTERES_INVALIDOS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '') || 'Cliente';
  const fecha = formatearFechaDocumento(presupuesto.fechaEmision).replaceAll('/', '-');
  return `Presupuesto - ${cliente} - ${fecha}.pdf`;
}

export const FORM_PRESUPUESTO_INICIAL = {
  fechaEmision: '',
  clienteId: '',
  clienteNombre: '',
  origenId: '',
  origenNombre: '',
  destinoId: '',
  destinoNombre: '',
  fechaServicio: '',
  horaSalida: '',
  cantidadPasajeros: '',
  vehiculoIds: [],
  importeNeto: '',
  formaPago: FORMA_PAGO_POR_DEFECTO,
  diasValidez: String(DIAS_VALIDEZ_POR_DEFECTO),
};

// Valores iniciales de un presupuesto nuevo: fecha de emisión de hoy (Córdoba).
export function valoresNuevoPresupuesto(ahora = Date.now()) {
  return { ...FORM_PRESUPUESTO_INICIAL, fechaEmision: hoyCordobaISO(ahora) };
}

// "420000.00" → "420.000"; "1234.50" → "1.234,50": el importe como lo tipearía
// el usuario, para precargar el formulario al duplicar.
function importeParaInput(importe) {
  const centavos = aCentavos(importe);
  return centavos === null ? '' : centavosAImporteIngresado(centavos);
}

// Duplicar: los datos del original (el mismo objeto de GET /:id) con la fecha
// de emisión de hoy. Al guardar se crea uno nuevo; el original no se toca.
export function valoresDuplicado(presupuesto, ahora = Date.now()) {
  return {
    fechaEmision: hoyCordobaISO(ahora),
    clienteId: presupuesto.cliente.id,
    clienteNombre: presupuesto.cliente.nombre,
    origenId: presupuesto.origen.id,
    origenNombre: presupuesto.origen.nombre,
    destinoId: presupuesto.destino.id,
    destinoNombre: presupuesto.destino.nombre,
    fechaServicio: presupuesto.fechaServicio,
    horaSalida: presupuesto.horaSalida ?? '',
    cantidadPasajeros: String(presupuesto.cantidadPasajeros),
    vehiculoIds: presupuesto.unidades.map((u) => u.vehiculoId),
    importeNeto: importeParaInput(presupuesto.importeNeto),
    formaPago: presupuesto.formaPago,
    diasValidez: String(presupuesto.diasValidez),
  };
}

// Error local del campo Importe, antes de enviar: un texto que no respeta el
// formato argentino NO se puede mandar al backend, porque algunos ("420.00")
// serían válidos con punto decimal y se guardarían con otro valor. Vacío no es
// error acá: el backend responde "El importe es obligatorio".
export function errorImporteIngresado(texto) {
  if (!texto.trim() || importeIngresadoACentavos(texto) !== null) return null;
  return 'Escribilo como 420000, 420.000 o 420.000,50';
}

// Valores del formulario → body de POST /presupuestos. El importe viaja como
// string con punto decimal ("1234.50"). El formulario no llama a esto con un
// importe inválido (ver errorImporteIngresado); vacío se manda vacío.
export function valoresAPayload(form) {
  const centavos = importeIngresadoACentavos(form.importeNeto);
  return {
    fechaEmision: form.fechaEmision,
    clienteId: form.clienteId,
    origenId: form.origenId,
    destinoId: form.destinoId,
    fechaServicio: form.fechaServicio,
    horaSalida: form.horaSalida,
    cantidadPasajeros: form.cantidadPasajeros,
    vehiculoIds: form.vehiculoIds,
    importeNeto: centavos === null ? form.importeNeto : centavosAString(centavos),
    formaPago: form.formaPago,
    diasValidez: form.diasValidez,
  };
}
