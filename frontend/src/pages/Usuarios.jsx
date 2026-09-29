import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import './Usuarios.css';

const FORM_INICIAL = {
  nombre: '',
  apellido: '',
  nombreUsuario: '',
  contrasena: '',
  perfil: '',
};

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargarUsuarios = useCallback(() => {
    setCargando(true);
    const params = {};
    if (busqueda) params.busqueda = busqueda;

    return api
      .get('/usuarios', { params })
      .then(({ data }) => setUsuarios(data.usuarios))
      .finally(() => setCargando(false));
  }, [busqueda]);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  function abrirForm() {
    setForm(FORM_INICIAL);
    setErrores({});
    setMensaje('');
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
  }

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
      setMostrarForm(false);
      setMensaje('Usuario creado correctamente.');
      cargarUsuarios();
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
      <div className="usuarios-header">
        <h1>Gestionar usuarios</h1>
        {!mostrarForm && (
          <Button variant="primary" onClick={abrirForm}>
            + Nuevo usuario
          </Button>
        )}
      </div>

      {mensaje && !mostrarForm && <Alert variant="success">{mensaje}</Alert>}

      {mostrarForm ? (
        <Card className="form-card">
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h2>Nuevo usuario</h2>
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

            <div className="form-actions">
              <Button type="submit" variant="primary" loading={enviando}>
                {enviando ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button type="button" variant="secondary" onClick={cerrarForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          <div className="usuarios-filtros">
            <FormField id="busqueda" label="Buscar por nombre o usuario">
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </FormField>
          </div>

          {cargando && (
            <div className="loading-state">
              <Spinner label="Cargando usuarios" />
              <span>Cargando usuarios…</span>
            </div>
          )}

          {!cargando && usuarios.length === 0 && (
            <Card className="usuarios-empty">No se encontraron usuarios</Card>
          )}

          {!cargando && usuarios.length > 0 && (
            <>
              <div className="usuarios-table-wrap">
                <table className="usuarios-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Usuario</th>
                      <th>Perfil</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => {
                      const colores = PERFIL_COLORS[u.perfil] || {};
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="usuarios-nombre">
                              <span
                                className="usuarios-avatar"
                                style={{ backgroundColor: colores.bg, color: colores.text }}
                              >
                                {initials(u.nombre, u.apellido)}
                              </span>
                              <span>
                                {u.nombre} {u.apellido}
                              </span>
                            </div>
                          </td>
                          <td>{u.nombreUsuario}</td>
                          <td>{perfilLabel(u.perfil)}</td>
                          <td>
                            <Badge variant={u.activo ? 'success' : 'neutral'}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="usuarios-cards">
                {usuarios.map((u) => {
                  const colores = PERFIL_COLORS[u.perfil] || {};
                  return (
                    <Card className="usuarios-card" key={u.id}>
                      <div className="usuarios-card-header">
                        <span
                          className="usuarios-avatar"
                          style={{ backgroundColor: colores.bg, color: colores.text }}
                        >
                          {initials(u.nombre, u.apellido)}
                        </span>
                        <div className="usuarios-card-info">
                          <span className="usuarios-card-nombre">
                            {u.nombre} {u.apellido}
                          </span>
                          <span className="usuarios-card-usuario">{u.nombreUsuario}</span>
                        </div>
                        <Badge variant={u.activo ? 'success' : 'neutral'}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <div className="usuarios-card-perfil">{perfilLabel(u.perfil)}</div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

export default Usuarios;
