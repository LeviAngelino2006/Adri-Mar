import { PERFILES } from './perfiles';

const TODOS_LOS_PERFILES = PERFILES.map((p) => p.value);

export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', end: true, icon: 'dashboard', perfiles: TODOS_LOS_PERFILES },
  { label: 'Usuarios', to: '/usuarios', icon: 'usuarios', perfiles: ['ADMINISTRADOR'] },
  {
    label: 'Flota de vehículos',
    to: '/vehiculos',
    icon: 'flota',
    perfiles: ['ADMINISTRADOR', 'PERSONAL_TALLER'],
  },
];

export function getNavItemsHabilitados(perfil) {
  return NAV_ITEMS.filter((item) => item.perfiles.includes(perfil));
}
