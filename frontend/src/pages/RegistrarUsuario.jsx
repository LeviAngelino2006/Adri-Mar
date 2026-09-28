import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { PERFILES } from '../constants/perfiles';
import Layout from '../components/Layout';

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
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" name="nombre" value={form.nombre} onChange={handleChange} />
          {errores.nombre && <p role="alert">{errores.nombre}</p>}
        </div>
        <div>
          <label htmlFor="apellido">Apellido</label>
          <input id="apellido" name="apellido" value={form.apellido} onChange={handleChange} />
          {errores.apellido && <p role="alert">{errores.apellido}</p>}
        </div>
        <div>
          <label htmlFor="nombreUsuario">Nombre de usuario</label>
          <input
            id="nombreUsuario"
            name="nombreUsuario"
            value={form.nombreUsuario}
            onChange={handleChange}
          />
          {errores.nombreUsuario && <p role="alert">{errores.nombreUsuario}</p>}
        </div>
        <div>
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            name="contrasena"
            type="password"
            value={form.contrasena}
            onChange={handleChange}
          />
          {errores.contrasena && <p role="alert">{errores.contrasena}</p>}
        </div>
        <div>
          <label htmlFor="perfil">Perfil</label>
          <select id="perfil" name="perfil" value={form.perfil} onChange={handleChange}>
            <option value="">Seleccionar…</option>
            {PERFILES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {errores.perfil && <p role="alert">{errores.perfil}</p>}
        </div>
        {errores.general && <p role="alert">{errores.general}</p>}
        {mensaje && <p role="status">{mensaje}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Layout>
  );
}

export default RegistrarUsuario;
