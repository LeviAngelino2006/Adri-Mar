import './IndicadorVencimiento.css';

const ICONO_ALERTA = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

// Indicador puramente visual (no es un estado ni bloquea ninguna acción): se
// deriva de `viaje.vencido`/`viaje.excedido`, calculados por el backend en
// serializarViaje contra la hora de Córdoba (ver viajeService.js). Nunca
// aparecen juntos (dependen de estados distintos: Programado vs En viaje) y
// nunca en Finalizado/Cancelado.
function IndicadorVencimiento({ viaje, size = 'sm' }) {
  if (!viaje) return null;

  let texto = null;
  if (viaje.vencido) texto = 'Vencido';
  else if (viaje.excedido) texto = 'Excedido';

  if (!texto) return null;

  return (
    <span className={`indicador-vencimiento indicador-vencimiento-${size}`}>
      {ICONO_ALERTA}
      {texto}
    </span>
  );
}

export default IndicadorVencimiento;
