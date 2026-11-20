// Qué muestra la página de Viajes, que alterna listado / ficha / formulario
// del viaje / datos administrativos en una sola ruta (sin react-router). Las
// pantallas son excluyentes: el render de Viajes.jsx pregunta solo por esto,
// así nunca aparece, por ejemplo, el listado debajo de un formulario.
//
// La prioridad importa: al abrir un formulario desde la ficha,
// useOrigenEdicion cierra la ficha (seleccionado = null), pero aunque quedara
// abierta, el formulario gana.
export const PANTALLAS_VIAJES = {
  listado: 'listado',
  ficha: 'ficha',
  form: 'form',
  admin: 'admin',
};

export function pantallaDeViajes({ mostrarForm, editandoAdmin, seleccionado }) {
  if (mostrarForm) return PANTALLAS_VIAJES.form;
  if (editandoAdmin) return PANTALLAS_VIAJES.admin;
  if (seleccionado) return PANTALLAS_VIAJES.ficha;
  return PANTALLAS_VIAJES.listado;
}
