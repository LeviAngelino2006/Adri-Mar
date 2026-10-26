import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
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
import './Personal.css';

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
  perfil: '',
  habilitadoParaConducir: false,
};

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

const NO_REGISTRADO = 'No registrado';

function ordenarPorPerfil(personas) {
  return [...personas].sort(
    (a, b) => PERFILES.findIndex((p) => p.value === a.perfil) - PERFILES.findIndex((p) => p.value === b.perfil)
  );
}

function Personal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idDesdeQuery = searchParams.get('id');

  const { usuario: usuarioActual } = useAuth();
  const perfilesDisponibles =
    usuarioActual.perfil === 'ENCARGADO'
      ? PERFILES.filter((p) => p.value !== 'ADMINISTRADOR')
      : PERFILES;

  const [personas, setPersonas] = useState([]);
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

  const cargarPersonas = useCallback(() => {
    setCargando(true);
    const params = {};
    if (busqueda) params.busqueda = busqueda;

    return api
      .get('/personas', { params })
      .then(({ data }) => {
        setPersonas(data.personas);
        if (idDesdeQuery) {
          const match = data.personas.find((p) => String(p.id) === String(idDesdeQuery));
          if (match) setSeleccionado(match);
        }
      })
      .finally(() => setCargando(false));
  }, [busqueda, idDesdeQuery]);

  useEffect(() => {
    cargarPersonas();
  }, [cargarPersonas]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  const seleccionadoId = seleccionado?.id ?? null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seleccionadoId, mostrarForm]);

  function seleccionar(p) {
    setMostrarForm(false);
    setSeleccionado(p);
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
      await api.patch(`/personas/${seleccionado.id}/baja`);
      setMensaje('Personal dado de baja correctamente.');
      setConfirmandoBaja(false);
      setSeleccionado(null);
      cargarPersonas();
    } catch (err) {
      setErrorBaja(err.response?.data?.error || 'No se pudo dar de baja a la persona');
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

  function abrirEditar(p) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      apellido: p.apellido,
      dni: p.dni || '',
      email: p.email || '',
      telefono: p.telefono || '',
      perfil: p.perfil,
      habilitadoParaConducir: p.habilitadoParaConducir,
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
        await api.put(`/personas/${editando.id}`, form);
        setMensaje('Datos actualizados correctamente.');
      } else {
        await api.post('/personas', form);
        setMensaje('Personal registrado correctamente.');
      }
      setMostrarForm(false);
      setEditando(null);
      cargarPersonas();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: editando ? 'No se pudieron guardar los cambios' : 'No se pudo registrar la persona' });
      }
    } finally {
      setEnviando(false);
    }
  }

  // El perfil y la habilitación de uno los cambia otro (el backend lo rechaza):
  // en la ficha propia no se ofrece "Dar de baja" y al editarse a sí mismo esos
  // dos campos quedan de solo lectura.
  const fichaPropia = seleccionado?.id === usuarioActual.personaId;
  const editandoPropia = editando?.id === usuarioActual.personaId;
  const switchBloqueado = (!editando && form.perfil === 'CHOFER') || editandoPropia;

  return (
    <Layout>
      {!mostrarForm && !seleccionado && (
        <ListadoHeader titulo="Personal de la Empresa" />
      )}

      {mensaje && !mostrarForm && <Toast>{mensaje}</Toast>}
      {errorBaja && <Alert variant="error">{errorBaja}</Alert>}

      {mostrarForm && (
        <>
          <button type="button" className="back-link" onClick={cerrarForm}>
            ← Volver al listado
          </button>
          <h1>{editando ? 'Editar datos de personal' : 'Registrar personal'}</h1>
          <Card className="form-card">
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                <FormField id="nombre" label="Nombre" required error={errores.nombre}>
                  <input name="nombre" value={form.nombre} onChange={handleChange} />
                </FormField>

                <FormField id="apellido" label="Apellido" required error={errores.apellido}>
                  <input name="apellido" value={form.apellido} onChange={handleChange} />
                </FormField>

                <FormField id="dni" label="DNI" required hint="7 u 8 dígitos, sin puntos" error={errores.dni}>
                  <input name="dni" inputMode="numeric" value={form.dni} onChange={handleChange} />
                </FormField>

                <FormField id="telefono" label="Teléfono" error={errores.telefono}>
                  <input name="telefono" type="tel" value={form.telefono} onChange={handleChange} />
                </FormField>

                <div className="form-field-ancho">
                  <FormField id="email" label="Email (opcional)" error={errores.email}>
                    <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="ejemplo@correo.com" />
                  </FormField>
                </div>

                <FormField
                  id="perfil"
                  label="Puesto / Perfil"
                  required
                  hint={editandoPropia ? 'Tu perfil lo cambia un Administrador.' : undefined}
                  error={errores.perfil}
                >
                  <select name="perfil" value={form.perfil} onChange={handleChange} disabled={editandoPropia}>
                    <OpcionVacia obligatorio>Elegí el perfil</OpcionVacia>
                    {perfilesDisponibles.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="form-field switch-field switch-field-par">
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
                  {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar personal'}
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
            busqueda={{ valor: busqueda, onChange: setBusqueda, placeholder: 'Buscar por nombre, apellido o DNI' }}
            accion={{ etiqueta: 'Registrar personal', onClick: abrirNuevo }}
          />

          {cargando && <Cargando forma="tarjetas" />}

          {!cargando && personas.length === 0 && <div className="listado-vacio">No se encontró personal</div>}

          {!cargando && personas.length > 0 && (
            <div className="listado-cards">
              {ordenarPorPerfil(personas).map((p) => {
                const colores = PERFIL_COLORS[p.perfil] || {};
                const cuentaTexto = p.usuario ? `@${p.usuario.nombreUsuario}` : 'Sin acceso al sistema';
                const pieItems = [p.dni ? `DNI ${formatearDni(p.dni)}` : '', cuentaTexto].filter(Boolean);

                return (
                  <ListadoCard
                    key={p.id}
                    marcaSinFondo
                    marca={
                      <span className="personal-avatar" style={{ backgroundColor: colores.bg, color: colores.text }}>
                        {initials(p.nombre, p.apellido)}
                      </span>
                    }
                    titulo={`${p.nombre} ${p.apellido}`}
                    estado={
                      <div className="personal-badges">
                        {p.habilitadoParaConducir && (
                          <span className="personal-conduce" title="Habilitado para conducir">
                            Chofer
                          </span>
                        )}
                        <EstadoBadge tono={p.activo ? 'success' : 'neutral'} size="sm">
                          {p.activo ? 'Activo' : 'Baja'}
                        </EstadoBadge>
                      </div>
                    }
                    sub={perfilLabel(p.perfil)}
                    pie={pieItems}
                    onClick={() => seleccionar(p)}
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

          <div className="personal-detalle-header">
            <h1>
              {seleccionado.nombre} {seleccionado.apellido}
            </h1>
            <EstadoBadge tono={seleccionado.activo ? 'success' : 'neutral'}>
              {seleccionado.activo ? 'Activo' : 'Baja'}
            </EstadoBadge>
          </div>

          <Card className="detalle-card personal-detalle" role="region" aria-label="Ficha de personal">
            <dl className="detalle-grid">
              <div className="detalle-item">
                <dt>DNI</dt>
                <dd>{seleccionado.dni ? formatearDni(seleccionado.dni) : NO_REGISTRADO}</dd>
              </div>
              <div className="detalle-item">
                <dt>Teléfono</dt>
                <dd>{seleccionado.telefono || NO_REGISTRADO}</dd>
              </div>
              <div className="detalle-item detalle-item-ancho">
                <dt>Email</dt>
                <dd>{seleccionado.email || NO_REGISTRADO}</dd>
              </div>
              <div className="detalle-item">
                <dt>Puesto / Perfil</dt>
                <dd>{perfilLabel(seleccionado.perfil)}</dd>
              </div>
              <div className="detalle-item">
                <dt>Habilitado para conducir</dt>
                <dd>{seleccionado.habilitadoParaConducir ? 'Sí' : 'No'}</dd>
              </div>
              <div className="detalle-item">
                <dt>Cuenta de acceso</dt>
                <dd>
                  {seleccionado.usuario
                    ? `@${seleccionado.usuario.nombreUsuario} · ${seleccionado.usuario.activo ? 'activa' : 'inactiva'}`
                    : 'Sin acceso al sistema'}
                </dd>
              </div>
              <div className="detalle-item">
                <dt>Registrado el</dt>
                <dd>{formatearFechaCorta(seleccionado.creadoEn)}</dd>
              </div>
            </dl>

            <div className="detalle-acciones">
              {(seleccionado.perfil === 'CHOFER' || seleccionado.habilitadoParaConducir) && (
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/documentacion?tab=choferes&choferId=${seleccionado.id}`)}
                >
                  Ver documentación
                </Button>
              )}
              {seleccionado.usuario && (
                <Button variant="secondary" onClick={() => navigate(`/usuarios?id=${seleccionado.usuario.id}`)}>
                  Administrar cuenta
                </Button>
              )}
              {!seleccionado.usuario && seleccionado.activo && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      `/usuarios?crearConPersonaId=${seleccionado.id}&nombre=${encodeURIComponent(
                        `${seleccionado.nombre} ${seleccionado.apellido}`
                      )}`
                    )
                  }
                >
                  Crear acceso al sistema
                </Button>
              )}
              {seleccionado.activo && (
                <>
                  <Button variant="secondary" onClick={() => abrirEditar(seleccionado)}>
                    Editar datos
                  </Button>
                  {!fichaPropia && (
                    <Button variant="danger" onClick={() => setConfirmandoBaja(true)}>
                      Dar de baja
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        </>
      )}

      <ConfirmModal
        open={confirmandoBaja}
        tone="danger"
        icon={ICONO_ALERTA}
        title="Dar de baja personal"
        description={
          seleccionado && (
            <>
              Vas a dar de baja a <strong>{seleccionado.nombre} {seleccionado.apellido}</strong> (DNI{' '}
              <strong>{formatearDni(seleccionado.dni)}</strong>).
              {seleccionado.usuario && (
                <p className="personal-aviso-cuenta">
                  Esta persona tiene la cuenta de usuario <strong>@{seleccionado.usuario.nombreUsuario}</strong>, que también será desactivada.
                </p>
              )}
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

export default Personal;
