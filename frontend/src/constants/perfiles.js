export const PERFILES = [
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'PERSONAL_TALLER', label: 'Personal de Taller' },
  { value: 'LOGISTICA', label: 'Logística' },
  { value: 'GERENCIA_GENERAL', label: 'Gerencia General' },
  { value: 'CHOFER', label: 'Chofer' },
];

export const PERFIL_COLORS = {
  ADMINISTRADOR: { bg: 'var(--brand-100)', text: 'var(--brand-700)' },
  GERENCIA_GENERAL: { bg: '#ede9fe', text: '#6d28d9' },
  LOGISTICA: { bg: 'var(--state-info-bg)', text: 'var(--state-info-text)' },
  PERSONAL_TALLER: { bg: 'var(--state-warning-bg)', text: 'var(--state-warning-text)' },
  CHOFER: { bg: 'var(--state-success-bg)', text: 'var(--state-success-text)' },
};
