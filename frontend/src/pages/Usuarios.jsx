import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import OpcionVacia from '../components/ui/OpcionVacia';
import Alert from '../components/ui/Alert';
import Cargando from '../components/ui/Cargando';
import Toast from '../components/ui/Toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import EstadoBadge from '../components/ui/EstadoBadge';
import { ListadoCard, ListadoHeader, ListadoToolbar } from '../components/Listado';
import { formatearDni, formatearFechaCorta } from '../utils/viajeFormato';
import './Usuarios.css';

const ICONO_ALERTA = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
  </svg>
);

const FORM_INICIAL = {
  personaId: '',
  nombreUsuario: '',
  contrasena: '',
};

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

function ordenarPorPerfil(usuarios) {
  return [...usuarios].sort(
    (a, b) => PERFILES.findIndex((p) => p.value === a.perfil) - PERFILES.findIndex((p) => p.value === b.perfil)
  );
}

function Usuarios() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idDesdeQuery = searchParams.get('id');
  const crearConPersonaId = searchParams.get('crearConPersonaId');
  const nombreSugerido = searchParams.get('nombre');

  const [usuarios, setUsuarios] = useState([]);
  const [personasSinUsuario, setPersonasSinUsuario] = useState([]);
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
      .then(({ data }) => {
        setUsuarios(data.usuarios);
        if (idDesdeQuery) {
          const match = data.usuarios.find((u) => String(u.id) === String(idDesdeQuery));
          if (match) setSeleccionado(match);
        }
      })
      .finally(() => setCargando(false));
  }, [busqueda, idDesdeQuery]);

  const cargarPersonasSinUsuario = useCallback(async () => {
    try {
      const { data } = await api.get('/personas', { params: { sinUsuario: 'true' } });
      setPersonasSinUsuario(data.personas || []);
    } catch {
      setPersonasSinUsuario([]);
    }
  }, []);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  useEffect(() => {
    if (crearConPersonaId) {
      cargarPersonasSinUsuario().then(() => {
        setEditando(null);
        setForm({
          personaId: String(crearConPersonaId),
          nombreUsuario: '',
          contrasena: '',
        });
        setErrores({});
        setSeleccionado(null);
        setMostrarForm(true);
      });
    }
  }, [crearConPersonaId, cargarPersonasSinUsuario]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seleccionadoId, mostrarForm]);

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
      setMensaje('Cuenta de usuario dada de baja correctamente.');
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
    cargarPersonasSinUsuario();
    setMostrarForm(true);
  }

  function abrirEditar(u) {
    setEditando(u);
    setForm({
      personaId: String(u.personaId || ''),
      nombreUsuario: u.nombreUsuario,
      contrasena: '',
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
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});
    setEnviando(true);
    try {
      if (editando) {
        const payload = {
          nombreUsuario: form.nombreUsuario,
        };
        if (form.contrasena && form.contrasena.trim()) {
          payload.contrasena = form.contrasena;
        }
        await api.put(`/usuarios/${editando.id}`, payload);
        setMensaje('Credenciales actualizadas correctamente.');
      } else {
        await api.post('/usuarios', {
          personaId: Number(form.personaId),
          nombreUsuario: form.nombreUsuario,
          contrasena: form.contrasena,
        });
        setMensaje('Cuenta de usuario creada correctamente.');
      }
      setMostrarForm(false);
      setEditando(null);
      cargarUsuarios();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: editando ? 'No se pudieron guardar los cambios' : 'No se pudo crear la cuenta de usuario' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <ListadoHeader titulo="Cuentas de Usuario (Acceso al Sistema)" />
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {mostrarForm && (
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Modificar credenciales de acceso' : 'Crear cuenta de acceso al sistema'}</h1>
          <Card className="form-card">
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                {editando ? (
                  <div className="form-field-ancho">
                    <FormField id="personaNombre" label="Persona vinculada">
                      <input
                        value={`${editando.nombre} ${editando.apellido} (Perfil: ${perfilLabel(editando.perfil)})`}
                        disabled
                        style={{ opacity: 0.8 }}
                      />
                    </FormField>
                  </div>
                ) : (
                  <div className="form-field-ancho">
                    <FormField
                      id="personaId"
                      label="Seleccionar persona en la empresa"
                      required
                      hint={personasSinUsuario.length === 0 && !crearConPersonaId ? 'No hay personas activas sin cuenta de usuario' : 'Asigna esta cuenta a un miembro del personal'}
                      error={errores.personaId}
                    >
                      <select
                        name="personaId"
                        value={form.personaId}
                        onChange={handleChange}
                      >
                        <OpcionVacia obligatorio>Elegí la persona</OpcionVacia>
                        {crearConPersonaId && !personasSinUsuario.some((p) => String(p.id) === String(crearConPersonaId)) && (
                          <option value={crearConPersonaId}>
                            {nombreSugerido || `Persona #${crearConPersonaId}`}
                          </option>
                        )}
                        {personasSinUsuario.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} {p.apellido} (DNI: {p.dni ? formatearDni(p.dni) : 'S/D'} - {perfilLabel(p.perfil)})
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                )}

                <FormField id="nombreUsuario" label="Nombre de usuario" required error={errores.nombreUsuario}>
                  <input
                    name="nombreUsuario"
                    value={form.nombreUsuario}
                    onChange={handleChange}
                    placeholder="ej. jperez"
                    autoComplete="off"
                  />
                </FormField>

                <FormField
                  id="contrasena"
                  label={editando ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                  required={!editando}
                  hint={editando ? 'Dejar en blanco para no modificar' : 'Al menos 8 caracteres'}
                  error={errores.contrasena}
                >
                  <input
                    name="contrasena"
                    type="password"
                    value={form.contrasena}
                    onChange={handleChange}
                    autoComplete="new-password"
                  />
                </FormField>
              </div>

              {errores.general && <Alert variant="error">{errores.general}</Alert>}

              <div className="form-actions">
                <Button type="submit" variant="primary" loading={enviando}>
                  {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cuenta'}
                </Button>
                <Button type="button" variant="secondary" onClick={cerrarForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}

      {!mostrarForm && !seleccionado && (
        <>
          <ListadoToolbar
            busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar por usuario, nombre o DNI' }}
            accion={{ etiqueta: '+ Crear cuenta', onClick: abrirNuevo }}
          />

          {cargando && <Cargando forma="tarjetas" />}

          {!cargando && usuarios.length === 0 && <div className="listado-vacio">No se encontraron cuentas de usuario</div>}

          {!cargando && usuarios.length > 0 && (
            <div className="listado-cards">
              {ordenarPorPerfil(usuarios).map((u) => {
                const colores = PERFIL_COLORS[u.perfil] || {};
                return (
                  <ListadoCard
                    key={u.id}
                    marcaSinFondo
                    marca={
                      <span className="usuarios-avatar" style={{ backgroundColor: colores.bg, color: colores.text }}>
                        {initials(u.nombre, u.apellido)}
                      </span>
                    }
                    titulo={`@${u.nombreUsuario}`}
                    estado={
                      <EstadoBadge tono={u.activo ? 'success' : 'neutral'} size="sm">
                        {u.activo ? 'Activa' : 'Inactiva'}
                      </EstadoBadge>
                    }
                    sub={`${u.nombre} ${u.apellido}`}
                    pie={[perfilLabel(u.perfil), u.dni ? `DNI ${formatearDni(u.dni)}` : ''].filter(Boolean)}
                    onClick={() => seleccionar(u)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {!mostrarForm && seleccionado && (
        <>
          <button type="button" className="back-link" onClick={cerrarFicha}>
            ← Volver al listado
          </button>

          <div className="usuarios-detalle-header">
            <div>
              <h1>@{seleccionado.nombreUsuario}</h1>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted)' }}>
                Cuenta asignada a <strong>{seleccionado.nombre} {seleccionado.apellido}</strong>
              </p>
            </div>
            <EstadoBadge tono={seleccionado.activo ? 'success' : 'neutral'}>
              {seleccionado.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
            </EstadoBadge>
          </div>

          <Card className="detalle-card usuarios-detalle" role="region" aria-label="Ficha de la cuenta">
            <dl className="detalle-grid">
              <div className="detalle-item">
                <dt>Nombre y apellido</dt>
                <dd>{seleccionado.nombre} {seleccionado.apellido}</dd>
              </div>
              <div className="detalle-item">
                <dt>Puesto / Perfil</dt>
                <dd>{perfilLabel(seleccionado.perfil)}</dd>
              </div>
              <div className="detalle-item">
                <dt>DNI</dt>
                <dd>{seleccionado.dni ? formatearDni(seleccionado.dni) : 'No registrado'}</dd>
              </div>
              <div className="detalle-item">
                <dt>Nombre de usuario (Login)</dt>
                <dd>@{seleccionado.nombreUsuario}</dd>
              </div>
              <div className="detalle-item">
                <dt>Habilitado para conducir</dt>
                <dd>{seleccionado.habilitadoParaConducir ? 'Sí' : 'No'}</dd>
              </div>
              <div className="detalle-item">
                <dt>Cuenta creada el</dt>
                <dd>{formatearFechaCorta(seleccionado.creadoEn)}</dd>
              </div>
            </dl>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {seleccionado.personaId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/personal?id=${seleccionado.personaId}`)}
                >
                  Ver ficha de personal completa →
                </Button>
              )}
            </div>

            {seleccionado.activo && (
              <div className="detalle-acciones">
                <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                  Modificar credenciales
                </Button>
                <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                  Desactivar acceso
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      <ConfirmModal
        open={confirmandoBaja}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Desactivar cuenta de usuario"
        description={
          seleccionado && (
            <>
              Vas a desactivar el acceso del usuario <strong>@{seleccionado.nombreUsuario}</strong>.
              No podrá iniciar sesión en el sistema.
              <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
                ℹ️ La persona <strong>{seleccionado.nombre} {seleccionado.apellido}</strong> seguirá registrada en el personal de la empresa con sus datos intactos.
              </p>
            </>
          )
        }
        confirmLabel="Desactivar acceso"
        onConfirm={confirmarBaja}
        onCancel={() => setConfirmandoBaja(false)}
      />
    </Layout>
  );
}

export default Usuarios;
