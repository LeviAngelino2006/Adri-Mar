import { PERFILES } from './perfiles';

const TODOS_LOS_PERFILES = PERFILES.map((p) => p.value);

function porPerfil(...perfiles) {
  return (usuario) => perfiles.includes(usuario.perfil);
}

export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', end: true, icon: 'dashboard', visible: porPerfil(...TODOS_LOS_PERFILES) },
  {
    label: 'Usuarios',
    to: '/usuarios',
    icon: 'usuarios',
    visible: porPerfil('ADMINISTRADOR', 'ENCARGADO'),
  },
  {
    label: 'Flota de vehículos',
    to: '/vehiculos',
    icon: 'flota',
    visible: porPerfil('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  },
  {
    label: 'Viajes',
    to: '/viajes',
    icon: 'viaje',
    visible: porPerfil('ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER'),
  },
  {
    // El perfil no importa acá: lo que define si alguien puede tener viajes
    // asignados es habilitadoParaConducir, que es independiente del perfil
    // (ver SCRUM-30: un Encargado habilitado para conducir también entra).
    label: 'Mis viajes',
    to: '/mis-viajes',
    icon: 'viaje',
    visible: (usuario) => usuario.habilitadoParaConducir === true,
  },
];

export function getNavItemsHabilitados(usuario) {
  return NAV_ITEMS.filter((item) => item.visible(usuario));
}
