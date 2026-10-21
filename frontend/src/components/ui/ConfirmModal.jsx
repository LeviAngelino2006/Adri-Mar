import Button from './Button';
import { useHayMasAbajo } from '../../hooks/useHayMasAbajo';
import './ConfirmModal.css';

// Encabezado (ícono y título) y pie (botones) fijos; el cuerpo (`description`)
// scrollea por dentro si el modal no entra en la pantalla, con un degradé en su
// borde de abajo mientras quede contenido por ver. Así los botones siempre están
// a la vista, también en Confirmar viaje a 390px o a 1280 × 800.
function ConfirmModal({
  open,
  tone = 'danger',
  size = 'default',
  icon,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) {
  const { ref: refCuerpo, hayMas, alScrollear } = useHayMasAbajo();

  if (!open) return null;

  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div
        className={size === 'wide' ? 'confirm-modal confirm-modal-wide' : 'confirm-modal'}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-encabezado">
          <div className={`confirm-modal-icon confirm-modal-icon-${tone}`}>{icon}</div>
          <h3>{title}</h3>
        </div>
        <div className={hayMas ? 'confirm-modal-cuerpo hay-mas-abajo' : 'confirm-modal-cuerpo'}>
          <div ref={refCuerpo} className="confirm-modal-description" onScroll={alScrollear}>
            {description}
          </div>
        </div>
        <div className="confirm-modal-actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
