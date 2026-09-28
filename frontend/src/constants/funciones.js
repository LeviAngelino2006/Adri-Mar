export const FUNCIONES = [
  { label: 'Gestionar usuarios', descripcion: 'Alta de usuarios del sistema', perfiles: ['ADMINISTRADOR'], to: '/usuarios/nuevo' },
  { label: 'Registrar vehículo', descripcion: 'Cargar un vehículo nuevo a la flota', perfiles: ['ADMINISTRADOR'], to: '/vehiculos/nuevo' },
  {
    label: 'Consultar flota de vehículos',
    descripcion: 'Ver, filtrar y gestionar los vehículos registrados',
    perfiles: ['ADMINISTRADOR', 'PERSONAL_TALLER'],
    to: '/vehiculos',
  },
];

export function getFuncionesHabilitadas(perfil) {
  return FUNCIONES.filter((f) => f.perfiles.includes(perfil));
}
