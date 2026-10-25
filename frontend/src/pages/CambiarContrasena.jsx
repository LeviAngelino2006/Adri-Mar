import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import { useFocoEnPrimerError } from '../hooks/useFocoEnPrimerError';
import { DURACION_TOAST_MS } from '../constants/toast';
import logo from '../assets/logo-adrimar.png';
import './Login.css';
import './CambiarContrasena.css';

const FORM_INICIAL = { contrasenaActual: '', contrasenaNueva: '', repetirContrasena: '' };

// Las mismas reglas que el backend (PUT /auth/contrasena), para mostrar todos
// los errores en una vuelta. "Repetir" solo existe acá: el backend no la recibe.
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

// Cambiar la propia contraseña (H11). Dos formas:
// - Obligatoria: la contraseña es provisoria (la definió un gestor). Las rutas
//   traen acá y no dejan ir a otro lado (ProtectedRoute); la pantalla va sin la
//   navegación, con el panel de marca del login, y solo ofrece cerrar sesión.
//   Al cambiarla, entra a la app.
// - Por elección: "Cambiar mi contraseña" en el menú del usuario de la sidebar.
//   Va dentro del Layout, como cualquier formulario.
function CambiarContrasena() {
  const { usuario, cambiarContrasena, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const obligatoria = Boolean(usuario.debeCambiarContrasena);

  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(''), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [mensaje]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');
    const erroresLocales = validar(form);
    setErrores(erroresLocales);
    if (Object.keys(erroresLocales).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      await cambiarContrasena(form.contrasenaActual, form.contrasenaNueva);
      if (obligatoria) {
        navigate('/', { replace: true });
        return;
      }
      setForm(FORM_INICIAL);
      setMensaje('Contraseña cambiada correctamente.');
    } catch (err) {
      const datos = err.response?.data;
      setErrores(datos?.errores ?? { general: datos?.error || 'No se pudo cambiar la contraseña' });
      enfocarPrimerError();
    } finally {
      setEnviando(false);
    }
  }

  function cancelar() {
    // Vuelve a donde estaba; si entró directo por la URL, al inicio.
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  }

  function cerrarSesion() {
    logout();
    navigate('/login', { replace: true });
  }

  const campo = (id, label, autoComplete, hint) => (
    <FormField id={id} label={label} required hint={hint} error={errores[id]}>
      <input type="password" name={id} value={form[id]} onChange={handleChange} autoComplete={autoComplete} />
    </FormField>
  );
  const campoActual = campo('contrasenaActual', 'Contraseña actual', 'current-password');
  const campoNueva = campo('contrasenaNueva', 'Contraseña nueva', 'new-password', 'Al menos 8 caracteres');
  const campoRepetir = campo('repetirContrasena', 'Repetí la contraseña nueva', 'new-password');
  const errorGeneral = errores.general && <Alert variant="error">{errores.general}</Alert>;
  const textoBoton = enviando ? 'Cambiando…' : 'Cambiar contraseña';

  if (obligatoria) {
    return (
      <main className="login-page">
        <div className="login-brand">
          <p className="login-brand-titulo">Adri-Mar Gestión Online</p>
          <p className="login-brand-sub">Viajes, flota y mantenimiento</p>
        </div>
        <div className="login-main">
          <Card className="login-card">
            <img src={logo} alt="Adri-Mar Gestión Online" className="login-logo" />
            <h1 className="cambiar-contrasena-titulo">Cambiá tu contraseña</h1>
            <p className="cambiar-contrasena-texto">
              Hola, {usuario.nombre}. Tu contraseña es provisoria: la definió quien te dio el acceso. Elegí una nueva para
              seguir.
            </p>
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
            <Button variant="ghost" className="cambiar-contrasena-salir" onClick={cerrarSesion}>
              Cerrar sesión
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <Layout>
      {mensaje && <Toast>{mensaje}</Toast>}
      <h1>Cambiar mi contraseña</h1>
      <Card className="form-card">
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
            <Button variant="secondary" onClick={cancelar}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={enviando}>
              {textoBoton}
            </Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

export default CambiarContrasena;
