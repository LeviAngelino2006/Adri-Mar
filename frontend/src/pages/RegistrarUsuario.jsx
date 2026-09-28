import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { PERFILES } from '../constants/perfiles';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';

const FORM_INICIAL = {
  nombre: '',
  apellido: '',
  nombreUsuario: '',
  contrasena: '',
  perfil: '',
};

function RegistrarUsuario() {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/usuarios', form);
      setMensaje('Usuario creado correctamente. Ya puede iniciar sesión.');
      setForm(FORM_INICIAL);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: 'No se pudo registrar el usuario' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Layout>
      <p className="page-back-link">
        <Link to="/">Volver</Link>
      </p>
      <h1>Registrar usuario</h1>

      <Card className="form-card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <FormField id="nombre" label="Nombre" error={errores.nombre}>
              <input name="nombre" value={form.nombre} onChange={handleChange} />
            </FormField>

            <FormField id="apellido" label="Apellido" error={errores.apellido}>
              <input name="apellido" value={form.apellido} onChange={handleChange} />
            </FormField>

            <FormField id="nombreUsuario" label="Nombre de usuario" error={errores.nombreUsuario}>
              <input name="nombreUsuario" value={form.nombreUsuario} onChange={handleChange} />
            </FormField>

            <FormField id="contrasena" label="Contraseña" error={errores.contrasena}>
              <input name="contrasena" type="password" value={form.contrasena} onChange={handleChange} />
            </FormField>

            <FormField id="perfil" label="Perfil" error={errores.perfil}>
              <select name="perfil" value={form.perfil} onChange={handleChange}>
                <option value="">Seleccionar…</option>
                {PERFILES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {errores.general && <Alert variant="error">{errores.general}</Alert>}
          {mensaje && <Alert variant="success">{mensaje}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

export default RegistrarUsuario;
