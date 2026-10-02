import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoDot from '../components/ui/EstadoDot';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import './Usuarios.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const FORM_INICIAL = {
  nombre: '',
  apellido: '',
  dni: '',
  email: '',
  telefono: '',
  nombreUsuario: '',
  contrasena: '',
  perfil: '',
  habilitadoParaConducir: false,
};

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

function estadoDotColor(activo) {
  return activo ? '#16a34a' : '#94a3b8';
}

function ordenarPorPerfil(usuarios) {
  return [...usuarios].sort(
    (a, b) => PERFILES.findIndex((p) => p.value === a.perfil) - PERFILES.findIndex((p) => p.value === b.perfil)
  );
}

function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const perfilesDisponibles =
    usuarioActual.perfil === 'ENCARGADO'
      ? PERFILES.filter((p) => p.value !== 'ADMINISTRADOR')
      : PERFILES;
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorBaja, setErrorBaja] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
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
    setSeleccionado(null);
    setConfirmandoBaja(false);
    setMensaje('');
    cargarUsuarios();
  }, [cargarUsuarios]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  function seleccionar(u) {
    setMostrarForm(false);
    setSeleccionado(u);
    setConfirmandoBaja(false);
    setMensaje('');
    setErrorBaja('');
  }

  function cerrarFicha() {
    setSeleccionado(null);
    setConfirmandoBaja(false);
  }

  async function confirmarBaja() {
    setErrorBaja('');
    try {
      await api.patch(`/usuarios/${seleccionado.id}/baja`);
      setMensaje('Usuario dado de baja correctamente.');
      setConfirmandoBaja(false);
      setSeleccionado(null);
      cargarUsuarios();
    } catch (err) {
      setErrorBaja(err.response?.data?.error || 'No se pudo dar de baja el usuario');
      setConfirmandoBaja(false);
    }
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_INICIAL);
    setErrores({});
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function abrirEditar(u) {
    setEditando(u);
    setForm({
      nombre: u.nombre,
      apellido: u.apellido,
      dni: u.dni || '',
      email: u.email || '',
      telefono: u.telefono || '',
      nombreUsuario: u.nombreUsuario,
      contrasena: '',
      perfil: u.perfil,
      habilitadoParaConducir: u.habilitadoParaConducir,
    });
    setErrores({});
    setSeleccionado(null);
    setMostrarForm(true);
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    if (name === 'perfil' && !editando) {
      setForm((f) => {
        const eraChofer = f.perfil === 'CHOFER';
        const esChofer = value === 'CHOFER';
        // Chofer fuerza el switch en true; salir de Chofer lo resetea a
        // false; entre dos perfiles no-Chofer el valor tildado a mano no se
        // toca (ver SCRUM-148/149 y la tarea de bloqueo condicional).
        let habilitadoParaConducir = f.habilitadoParaConducir;
        if (esChofer) {
          habilitadoParaConducir = true;
        } else if (eraChofer) {
          habilitadoParaConducir = false;
        }
        return { ...f, perfil: value, habilitadoParaConducir };
      });
      return;
    }

    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});
    setEnviando(true);
    try {
      if (editando) {
        await api.put(`/usuarios/${editando.id}`, form);
        setMensaje('Cambios guardados correctamente.');
      } else {
        await api.post('/usuarios', form);
        setMensaje('Usuario creado correctamente.');
      }
      setMostrarForm(false);
      setEditando(null);
      cargarUsuarios();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: editando ? 'No se pudieron guardar los cambios' : 'No se pudo registrar el usuario' });
      }
    } finally {
      setEnviando(false);
    }
  }

  // El switch solo se fuerza/bloquea por perfil en el ALTA. En edición es
  // siempre editable a mano, sin recalcularse (comportamiento sin cambios).
  const switchBloqueado = !editando && form.perfil === 'CHOFER';

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <div className="usuarios-header">
          <h1>Gestionar usuarios</h1>
          <Button variant="primary" onClick={abrirNuevo}>
            + Nuevo usuario
          </Button>
        </div>
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {mostrarForm && (
        <Card className="form-card">
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar usuario' : 'Nuevo usuario'}</h1>
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <FormField id="nombre" label="Nombre" error={errores.nombre}>
                <input name="nombre" value={form.nombre} onChange={handleChange} />
              </FormField>

              <FormField id="apellido" label="Apellido" error={errores.apellido}>
                <input name="apellido" value={form.apellido} onChange={handleChange} />
              </FormField>

              <FormField id="dni" label="DNI" error={errores.dni}>
                <input name="dni" value={form.dni} onChange={handleChange} />
              </FormField>

              <FormField id="email" label="Email" error={errores.email}>
                <input name="email" type="email" value={form.email} onChange={handleChange} />
              </FormField>

              <FormField id="telefono" label="Teléfono" error={errores.telefono} hint="Opcional">
                <input name="telefono" type="tel" value={form.telefono} onChange={handleChange} />
              </FormField>

              <FormField id="nombreUsuario" label="Nombre de usuario" error={errores.nombreUsuario}>
                <input name="nombreUsuario" value={form.nombreUsuario} onChange={handleChange} />
              </FormField>

              {!editando && (
                <FormField id="contrasena" label="Contraseña" error={errores.contrasena}>
                  <input name="contrasena" type="password" value={form.contrasena} onChange={handleChange} />
                </FormField>
              )}

              <FormField id="perfil" label="Perfil" error={errores.perfil}>
                <select name="perfil" value={form.perfil} onChange={handleChange}>
                  <option value="">Seleccionar…</option>
                  {perfilesDisponibles.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="form-field switch-field">
                <label
                  htmlFor="habilitadoParaConducir"
                  className={`switch-field-label ${switchBloqueado ? 'switch-field-label-disabled' : ''}`.trim()}
                >
                  <Switch
                    id="habilitadoParaConducir"
                    name="habilitadoParaConducir"
                    checked={form.habilitadoParaConducir}
                    disabled={switchBloqueado}
                    onChange={handleChange}
                  />
                  Habilitado para conducir
                </label>
              </div>
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
      )}

      {!mostrarForm && !seleccionado && (
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
                      <th>Perfil</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenarPorPerfil(usuarios).map((u) => {
                      const colores = PERFIL_COLORS[u.perfil] || {};
                      return (
                        <tr
                          key={u.id}
                          className="usuarios-row"
                          tabIndex={0}
                          onClick={() => seleccionar(u)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              seleccionar(u);
                            }
                          }}
                        >
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
                          <td>{perfilLabel(u.perfil)}</td>
                          <td>
                            <EstadoDot color={estadoDotColor(u.activo)}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </EstadoDot>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="usuarios-cards">
                {ordenarPorPerfil(usuarios).map((u) => {
                  const colores = PERFIL_COLORS[u.perfil] || {};
                  return (
                    <button type="button" className="usuarios-card" key={u.id} onClick={() => seleccionar(u)}>
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
                        <span className="usuarios-card-perfil-sub">{perfilLabel(u.perfil)}</span>
                      </div>
                      <EstadoDot color={estadoDotColor(u.activo)}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </EstadoDot>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (
        <Card className="usuarios-detalle" role="region" aria-label="Ficha del usuario">
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="usuarios-detalle-header">
            <h1>
              {seleccionado.nombre} {seleccionado.apellido}
            </h1>
            <EstadoDot color={estadoDotColor(seleccionado.activo)} size="md">
              {seleccionado.activo ? 'Activo' : 'Inactivo'}
            </EstadoDot>
          </div>

          <dl className="usuarios-detalle-list">
            <div className="detalle-item">
              <dt>DNI</dt>
              <dd>{seleccionado.dni || '—'}</dd>
            </div>
            <div className="detalle-item">
              <dt>Email</dt>
              <dd>{seleccionado.email || '—'}</dd>
            </div>
            <div className="detalle-item">
              <dt>Teléfono</dt>
              <dd>{seleccionado.telefono || '—'}</dd>
            </div>
            <div className="detalle-item">
              <dt>Nombre de usuario</dt>
              <dd>{seleccionado.nombreUsuario}</dd>
            </div>
            <div className="detalle-item">
              <dt>Perfil</dt>
              <dd>{perfilLabel(seleccionado.perfil)}</dd>
            </div>
            <div className="detalle-item">
              <dt>Habilitado para conducir</dt>
              <dd>{seleccionado.habilitadoParaConducir ? 'Sí' : 'No'}</dd>
            </div>
            <div className="detalle-item">
              <dt>Registrado el</dt>
              <dd>{new Date(seleccionado.creadoEn).toLocaleDateString()}</dd>
            </div>
          </dl>

          {seleccionado.activo && (
            <div className="usuarios-detalle-actions">
              <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                Dar de baja
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmModal
        open={confirmandoBaja}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Dar de baja el usuario"
        description={
          seleccionado && (
            <>
              Vas a dar de baja a <strong>{seleccionado.nombre} {seleccionado.apellido}</strong> (usuario{' '}
              <strong>{seleccionado.nombreUsuario}</strong>). No va a poder iniciar sesión y esta acción no se puede
              deshacer desde acá.
            </>
          )
        }
        confirmLabel="Dar de baja"
        onConfirm={confirmarBaja}
        onCancel={() => setConfirmandoBaja(false)}
      />
    </Layout>
  );
}

export default Usuarios;
