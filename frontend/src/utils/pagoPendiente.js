const ESTADO_PAGO_PENDIENTE = 'PENDIENTE';

// Estado y fecha de cada pago (al cliente y al chofer).
const PARES_PAGO = [
  { estado: 'estadoPagoClienteId', fecha: 'fechaPagoCliente' },
  { estado: 'estadoPagoChoferId', fecha: 'fechaPagoChofer' },
];

// ¿El estado elegido es Pendiente? `estadoId` puede venir como número (del
// viaje) o como string (del <select>). Sin catálogo cargado todavía → false.
export function esPagoPendiente(estadoId, estadosPago) {
  if (estadoId === '' || estadoId == null) return false;
  return estadosPago.some((e) => String(e.id) === String(estadoId) && e.descripcion === ESTADO_PAGO_PENDIENTE);
}

// Un pago Pendiente no tiene fecha de pago (SCRUM-249, mismo criterio que el
// backend): vacía la fecha de cada pago que esté Pendiente.
export function limpiarFechasDePagosPendientes(valores, estadosPago) {
  let resultado = valores;
  for (const { estado, fecha } of PARES_PAGO) {
    if (resultado[fecha] !== '' && esPagoPendiente(resultado[estado], estadosPago)) {
      resultado = { ...resultado, [fecha]: '' };
    }
  }
  return resultado;
}
