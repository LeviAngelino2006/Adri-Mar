import Button from './Button';
import './ConfirmModal.css';

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
        <div className={`confirm-modal-icon confirm-modal-icon-${tone}`}>{icon}</div>
        <h3>{title}</h3>
        <div className="confirm-modal-description">{description}</div>
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
