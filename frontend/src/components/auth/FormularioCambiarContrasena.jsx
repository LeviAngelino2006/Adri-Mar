import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import FormField from '../ui/FormField';
import InputContrasena from '../ui/InputContrasena';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import ConfirmModal from '../ui/ConfirmModal';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';

const FORM_INICIAL = { contrasenaActual: '', contrasenaNueva: '', repetirContrasena: '' };

const ICONO_CONFIRMAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

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
function FormularioCambiarContrasena({
  idFormulario,
  disposicion = 'grilla',
  mostrarAcciones = true,
  pedirConfirmacion = false,
  onEnviandoChange,
  onConfirmandoChange,
  onExito,
  onCancelar,
}) {
  const { usuario, cambiarContrasena } = useAuth();
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  function actualizarEnviando(valor) {
    setEnviando(valor);
    onEnviandoChange?.(valor);
  }

  function actualizarConfirmando(valor) {
    setConfirmando(valor);
    onConfirmandoChange?.(valor);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function ejecutarCambio() {
    actualizarEnviando(true);
    try {
      await cambiarContrasena(form.contrasenaActual, form.contrasenaNueva);
      setForm(FORM_INICIAL);
      setErrores({});
      actualizarConfirmando(false);
      onExito?.();
    } catch (err) {
      const datos = err.response?.data;
      actualizarConfirmando(false);
      setErrores(datos?.errores ?? { general: datos?.error || 'No se pudo cambiar la contraseña' });
      enfocarPrimerError();
    } finally {
      actualizarEnviando(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const erroresLocales = validar(form);
    setErrores(erroresLocales);
    if (Object.keys(erroresLocales).length > 0) {
      enfocarPrimerError();
      return;
    }

    if (pedirConfirmacion) {
      actualizarConfirmando(true);
      return;
    }

    await ejecutarCambio();
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

  const modalConfirmacion = pedirConfirmacion && (
    <ConfirmModal
      open={confirmando}
      tone="brand"
      icon={ICONO_CONFIRMAR}
      title="¿Cambiar contraseña?"
      description="Vas a actualizar la contraseña de acceso a tu cuenta."
      confirmLabel={enviando ? 'Cambiando…' : 'Sí, cambiar'}
      confirmDisabled={enviando}
      cancelLabel="Volver"
      onConfirm={ejecutarCambio}
      onCancel={() => {
        if (!enviando) actualizarConfirmando(false);
      }}
    />
  );

  if (disposicion === 'columna') {
    return (
      <>
        <form
          id={idFormulario}
          ref={refForm}
          className={!mostrarAcciones ? 'doc-modal-form' : undefined}
          onSubmit={handleSubmit}
          noValidate
        >
          <input type="text" name="nombreUsuario" value={usuario.nombreUsuario} autoComplete="username" readOnly hidden />
          {campoActual}
          {campoNueva}
          {campoRepetir}
          {errorGeneral}
          {mostrarAcciones && (
            <Button type="submit" variant="primary" loading={enviando} className="login-submit">
              {textoBoton}
            </Button>
          )}
        </form>
        {modalConfirmacion}
      </>
    );
  }

  return (
    <>
      <form id={idFormulario} ref={refForm} onSubmit={handleSubmit} noValidate>
        <input type="text" name="nombreUsuario" value={usuario.nombreUsuario} autoComplete="username" readOnly hidden />
        <div className="form-grid">
          {campoActual}
          <div className="form-hueco" aria-hidden="true" />
          {campoNueva}
          {campoRepetir}
        </div>
        {errorGeneral}
        {mostrarAcciones && (
          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {textoBoton}
            </Button>
            {onCancelar && (
              <Button type="button" variant="secondary" onClick={onCancelar} disabled={enviando}>
                Cancelar
              </Button>
            )}
          </div>
        )}
      </form>
      {modalConfirmacion}
    </>
  );
}

export default FormularioCambiarContrasena;
