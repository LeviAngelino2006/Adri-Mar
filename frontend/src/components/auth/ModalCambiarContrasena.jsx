import { useState } from 'react';
import ModalMarco from '../documentacion/ModalMarco';
import Button from '../ui/Button';
import FormularioCambiarContrasena from './FormularioCambiarContrasena';

const ID_FORM = 'form-cambiar-contrasena';

// Ventana modal para cambiar la propia contraseña desde Mi perfil, con paso de
// confirmación antes de aplicar el cambio.
function ModalCambiarContrasena({ onClose, onExito }) {
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <ModalMarco
      titulo="Cambiar mi contraseña"
      onClose={() => {
        if (!enviando && !confirmando) onClose();
      }}
      pie={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={ID_FORM} loading={enviando}>
            {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
          </Button>
        </>
      }
    >
      <FormularioCambiarContrasena
        idFormulario={ID_FORM}
        disposicion="columna"
        mostrarAcciones={false}
        pedirConfirmacion
        onEnviandoChange={setEnviando}
        onConfirmandoChange={setConfirmando}
        onExito={onExito}
      />
    </ModalMarco>
  );
}

export default ModalCambiarContrasena;
