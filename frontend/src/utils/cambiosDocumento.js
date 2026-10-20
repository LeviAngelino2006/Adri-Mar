import { fechaCordobaISO } from './fechaCordoba';

// Fecha "YYYY-MM-DD" para un <input type="date"> a partir de un instante de la API.
export const aInputFecha = (valor) => (valor ? fechaCordobaISO(valor) : '');

// ¿El formulario de una actualización cambió algo respecto de la versión actual?
// Un PDF nuevo, una fecha o las observaciones. Sin cambios, "Guardar" no se
// habilita: guardar crearía una versión idéntica y, con el historial lleno, la
// purga borraría la versión más vieja (el backend responde 400 igual).
export function hayCambiosEnActualizacion(documentoActual, { archivo, fechaEmision, fechaVencimiento, observaciones }, requiereVencimiento) {
  return (
    Boolean(archivo) ||
    fechaEmision !== aInputFecha(documentoActual.fechaEmision) ||
    (requiereVencimiento && fechaVencimiento !== aInputFecha(documentoActual.fechaVencimiento)) ||
    observaciones.trim() !== (documentoActual.observaciones ?? '').trim()
  );
}
