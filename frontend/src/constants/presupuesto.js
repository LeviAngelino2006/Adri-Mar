// Textos fijos de los presupuestos (formulario y PDF). Viven acá y no en el
// JSX para poder cambiarlos en un solo lugar.

// Valor inicial del campo "Forma de pago". En el Word original decía
// "EFECTICO"; va corregido.
export const FORMA_PAGO_POR_DEFECTO = 'EFECTIVO / TRANSFERENCIA BANCARIA Y/O VALORES A 30 Y 60 DÍAS';

export const DIAS_VALIDEZ_POR_DEFECTO = 15;
export const DIAS_VALIDEZ_MIN = 1;
export const DIAS_VALIDEZ_MAX = 365;

// Lo que se muestra cuando el presupuesto no tiene horario de salida.
export const HORARIO_A_CONFIRMAR = 'A confirmar';

export const TEXTO_INTRODUCCION =
  'Nos complace enviarle el presupuesto solicitado del servicio de transporte de pasajeros, con el siguiente detalle:';

export const CLAUSULA_MODIFICACIONES =
  'En caso de producirse modificaciones en el recorrido, horario, cantidad de pasajeros o requerimientos adicionales, el valor del servicio podrá ser actualizado.';

export const CONTACTO = {
  telefono: '+5493571357912',
  email: 'adrimarviajes@gmail.com',
};

// Firmantes del PDF. `archivo` es el nombre que acepta el endpoint
// GET /api/presupuestos/assets/firma/:nombre (whitelist en el backend).
export const FIRMANTES = [
  { nombre: 'Marina Scagliarini', archivo: 'marina' },
  { nombre: 'Pedro Scagliarini', archivo: 'pedro' },
];
