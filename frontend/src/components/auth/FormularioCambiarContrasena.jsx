import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import FormField from '../ui/FormField';
import InputContrasena from '../ui/InputContrasena';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';

const FORM_INICIAL = { contrasenaActual: '', contrasenaNueva: '', repetirContrasena: '' };

// Mismas reglas que el backend (PUT /auth/contrasena) para mostrar todos los
// errores en una vuelta. "Repetir" solo existe en el front.
function validar({ contrasenaActual, contrasenaNueva, repetirContrasena }) {
  const errores = {};
  if (!contrasenaActual) errores.contrasenaActual = 'Ingresá tu contraseña actual';
  if (!contrasenaNueva) errores.contrasenaNueva = 'La contraseña nueva es obligatoria';
  else if (contrasenaNueva.trim() === '') errores.contrasenaNueva = 'La contraseña no puede tener solo espacios';
  else if (contrasenaNueva.length < 8) errores.contrasenaNueva = 'La contraseña debe tener al menos 8 caracteres';
  else if (contrasenaNueva === contrasenaActual) errores.contrasenaNueva = 'Tiene que ser distinta de la actual';
  if (!repetirContrasena) errores.repetirContrasena = 'Repetí la contraseña nueva';
  else if (contrasenaNueva && repetirContrasena !== contrasenaNueva) errores.repetirContrasena = 'Las contraseñas no coinciden';
  return errores;
}

// Formulario reutilizable para cambiar la propia contraseña:
// - disposicion="columna": pantalla obligatoria por contraseña provisoria.
// - disposicion="grilla": sección dentro de Mi perfil (2 columnas desde 640px).
function FormularioCambiarContrasena({ disposicion = 'grilla', onExito }) {
  const { usuario, cambiarContrasena } = useAuth();
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const erroresLocales = validar(form);
    setErrores(erroresLocales);
    if (Object.keys(erroresLocales).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      await cambiarContrasena(form.contrasenaActual, form.contrasenaNueva);
      setForm(FORM_INICIAL);
      setErrores({});
      onExito?.();
    } catch (err) {
      const datos = err.response?.data;
      setErrores(datos?.errores ?? { general: datos?.error || 'No se pudo cambiar la contraseña' });
      enfocarPrimerError();
    } finally {
      setEnviando(false);
    }
  }

  const campo = (id, label, autoComplete, hint) => (
    <FormField id={id} label={label} required hint={hint} error={errores[id]}>
      <InputContrasena name={id} value={form[id]} onChange={handleChange} autoComplete={autoComplete} />
    </FormField>
  );

  const campoActual = campo('contrasenaActual', 'Contraseña actual', 'current-password');
  const campoNueva = campo('contrasenaNueva', 'Contraseña nueva', 'new-password', 'Al menos 8 caracteres');
  const campoRepetir = campo('repetirContrasena', 'Repetí la contraseña nueva', 'new-password');
  const errorGeneral = errores.general && <Alert variant="error">{errores.general}</Alert>;
  const textoBoton = enviando ? 'Cambiando…' : 'Cambiar contraseña';

  if (disposicion === 'columna') {
    return (
      <form ref={refForm} onSubmit={handleSubmit} noValidate>
        <input type="text" name="nombreUsuario" value={usuario.nombreUsuario} autoComplete="username" readOnly hidden />
        {campoActual}
        {campoNueva}
        {campoRepetir}
        {errorGeneral}
        <Button type="submit" variant="primary" loading={enviando} className="login-submit">
          {textoBoton}
        </Button>
      </form>
    );
  }

  return (
    <form ref={refForm} onSubmit={handleSubmit} noValidate>
      <input type="text" name="nombreUsuario" value={usuario.nombreUsuario} autoComplete="username" readOnly hidden />
      <div className="form-grid">
        {campoActual}
        <div className="form-hueco" aria-hidden="true" />
        {campoNueva}
        {campoRepetir}
      </div>
      {errorGeneral}
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando}>
          {textoBoton}
        </Button>
      </div>
    </form>
  );
}

export default FormularioCambiarContrasena;
