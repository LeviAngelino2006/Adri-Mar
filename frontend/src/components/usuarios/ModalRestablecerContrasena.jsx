import { useState } from 'react';
import api from '../../services/api';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import InputContrasena from '../ui/InputContrasena';
import ModalMarco from '../documentacion/ModalMarco';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';

// Las mismas reglas que el backend (PATCH /usuarios/:id/contrasena) y que
// "Cambiar mi contraseña", para mostrar todos los errores en una vuelta.
// "Repetí la contraseña" solo existe acá: el backend no la recibe.
function validar({ contrasenaNueva, repetirContrasena }) {
  const errores = {};
  if (!contrasenaNueva) errores.contrasenaNueva = 'La contraseña nueva es obligatoria';
  else if (contrasenaNueva.trim() === '') errores.contrasenaNueva = 'La contraseña no puede tener solo espacios';
  else if (contrasenaNueva.length < 8) errores.contrasenaNueva = 'La contraseña debe tener al menos 8 caracteres';
  if (!repetirContrasena) errores.repetirContrasena = 'Repetí la contraseña nueva';
  else if (contrasenaNueva && repetirContrasena !== contrasenaNueva) errores.repetirContrasena = 'Las contraseñas no coinciden';
  return errores;
}

// Restablecer la contraseña de OTRA cuenta (SCRUM-258): el gestor escribe una
// nueva, sin la actual y sin mail. Queda provisoria: su dueño la tiene que
// cambiar la próxima vez que ingrese. Se monta solo mientras está abierto.
function ModalRestablecerContrasena({ usuario, onClose, onSuccess }) {
  const [form, setForm] = useState({ contrasenaNueva: '', repetirContrasena: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  function cambiar(e) {
    const { name, value } = e.target;
    setForm((actual) => ({ ...actual, [name]: value }));
    setErrores((actuales) => ({ ...actuales, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const invalidos = validar(form);
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      const { data } = await api.patch(`/usuarios/${usuario.id}/contrasena`, { contrasenaNueva: form.contrasenaNueva });
      onSuccess(data.usuario);
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend?.contrasenaNueva) setErrores({ contrasenaNueva: delBackend.contrasenaNueva });
      else setError(mensaje || 'No se pudo restablecer la contraseña. Intentá de nuevo.');
      enfocarPrimerError();
      setEnviando(false);
    }
  }

  return (
    <ModalMarco
      titulo={`Restablecer contraseña de ${usuario.nombreUsuario}`}
      onClose={onClose}
      pie={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-restablecer-contrasena" loading={enviando}>
            {enviando ? 'Restableciendo…' : 'Restablecer contraseña'}
          </Button>
        </>
      }
    >
      <form id="form-restablecer-contrasena" ref={refForm} className="doc-modal-form" onSubmit={handleSubmit} noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          id="restablecer-contrasena-nueva"
          label="Nueva contraseña"
          required
          hint="Al menos 8 caracteres. Es provisoria: la va a cambiar al ingresar."
          error={errores.contrasenaNueva}
        >
          <InputContrasena
            name="contrasenaNueva"
            value={form.contrasenaNueva}
            onChange={cambiar}
            autoComplete="new-password"
          />
        </FormField>
        <FormField id="restablecer-contrasena-repetir" label="Repetí la contraseña" required error={errores.repetirContrasena}>
          <InputContrasena
            name="repetirContrasena"
            value={form.repetirContrasena}
            onChange={cambiar}
            autoComplete="new-password"
          />
        </FormField>
      </form>
    </ModalMarco>
  );
}

export default ModalRestablecerContrasena;
