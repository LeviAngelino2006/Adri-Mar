import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import logo from '../assets/logo-adrimar.png';
import './Login.css';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(nombreUsuario, contrasena);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand">
        <p className="login-brand-titulo">Adri-Mar Gestión Online</p>
        <p className="login-brand-sub">Viajes, flota y mantenimiento</p>
      </div>
      <div className="login-main">
        <Card className="login-card">
          <img src={logo} alt="Adri-Mar Gestión Online" className="login-logo" />
          <h1 className="sr-only">Iniciar sesión</h1>
          <form onSubmit={handleSubmit} noValidate>
            <FormField id="nombreUsuario" label="Usuario">
              <input
                type="text"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                autoComplete="username"
                required
              />
            </FormField>

            <FormField id="contrasena" label="Contraseña">
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" variant="primary" loading={enviando} className="login-submit">
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

export default Login;
