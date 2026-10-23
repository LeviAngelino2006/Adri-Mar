// Campos que el alta y la edición de un viaje exigen siempre, en cualquier
// estado: el cliente, los extremos del recorrido y la fecha de inicio. Se
// validan juntos en el front para que los errores salgan en una sola vuelta: el
// backend valida primero cliente, origen y destino y recién después la fecha
// (validarCamposCore y validarCamposOperativos en viajeService), así que sin
// esto los errores llegaban de a tandas. Los textos son los mismos del backend,
// que sigue validando todo igual.
export const ERRORES_VIAJE = {
  clienteId: 'El cliente es obligatorio',
  origenId: 'El origen es obligatorio',
  destinoId: 'El destino es obligatorio',
  fechaInicio: 'La fecha y hora de inicio es obligatoria',
};

const vacio = (valor) => valor === '' || valor === null || valor === undefined;

// { campo: mensaje } de los obligatorios que faltan; {} si están todos.
export function erroresObligatoriosViaje(form) {
  const errores = {};
  for (const [campo, mensaje] of Object.entries(ERRORES_VIAJE)) {
    if (vacio(form[campo])) errores[campo] = mensaje;
  }
  return errores;
}
