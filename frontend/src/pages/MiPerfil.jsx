import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ConfirmModal from '../components/ui/ConfirmModal';
import EstadoCarga from '../components/ui/EstadoCarga';
import Toast from '../components/ui/Toast';
import ModalCambiarContrasena from '../components/auth/ModalCambiarContrasena';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import { DURACION_TOAST_MS } from '../constants/toast';
import { useCarga } from '../hooks/useCarga';
import './MiPerfil.css';

const ICONO_LOGOUT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

function MiPerfil() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mensaje, setMensaje] = useState('');
  const [cambiandoContrasena, setCambiandoContrasena] = useState(false);
  const [confirmandoLogout, setConfirmandoLogout] = useState(false);

  function handleLogout() {
    setConfirmandoLogout(false);
    logout();
    navigate('/login', { replace: true });
  }

  const pedirPerfil = useCallback(async () => {
    const { data } = await api.get('/auth/perfil');
    return data.usuario;
  }, []);

  const carga = useCarga(pedirPerfil);
  const datos = carga.datos;

  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(''), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [mensaje]);

  const colores = PERFIL_COLORS[datos?.perfil] || {};

  return (
    <Layout>
      {mensaje && <Toast>{mensaje}</Toast>}
      <div className="mi-perfil">
        <h1 className="mi-perfil-titulo">Mi perfil</h1>

        <EstadoCarga
          carga={carga}
          forma="filas"
          cantidad={2}
          que="tu perfil"
          vacio={!datos && <p className="mi-perfil-vacio">No se encontraron los datos de tu cuenta.</p>}
        >
          {datos && (
            <Card className="detalle-card" role="region" aria-label="Datos de tu cuenta">
              <div className="mi-perfil-cabecera">
                <span
                  className="mi-perfil-avatar"
                  style={{ backgroundColor: colores.bg, color: colores.text }}
                  aria-hidden="true"
                >
                  {initials(datos.nombre, datos.apellido)}
                </span>
                <div className="mi-perfil-identidad">
                  <span className="mi-perfil-nombre">
                    {datos.nombre} {datos.apellido}
                  </span>
                  <span className="mi-perfil-usuario">@{datos.nombreUsuario}</span>
                </div>
              </div>

              <dl className="detalle-grid">
                <div className="detalle-item">
                  <dt>Nombre y apellido</dt>
                  <dd>
                    {datos.nombre} {datos.apellido}
                  </dd>
                </div>
                <div className="detalle-item">
                  <dt>Nombre de usuario</dt>
                  <dd>@{datos.nombreUsuario}</dd>
                </div>
                <div className="detalle-item">
                  <dt>Perfil</dt>
                  <dd>{perfilLabel(datos.perfil)}</dd>
                </div>
              </dl>
            </Card>
          )}
        </EstadoCarga>

        <div className="mi-perfil-acciones">
          <Button variant="secondary" onClick={() => setCambiandoContrasena(true)}>
            Cambiar mi contraseña
          </Button>
          <Button variant="danger" onClick={() => setConfirmandoLogout(true)}>
            Cerrar sesión
          </Button>
        </div>

        {cambiandoContrasena && (
          <ModalCambiarContrasena
            onClose={() => setCambiandoContrasena(false)}
            onExito={() => {
              setMensaje('Contraseña cambiada correctamente.');
              setCambiandoContrasena(false);
            }}
          />
        )}

        <ConfirmModal
          open={confirmandoLogout}
          tone="danger"
          icon={ICONO_LOGOUT}
          title="Cerrar sesión"
          description="¿Seguro que querés cerrar tu sesión?"
          confirmLabel="Cerrar sesión"
          onConfirm={handleLogout}
          onCancel={() => setConfirmandoLogout(false)}
        />
      </div>
    </Layout>
  );
}

export default MiPerfil;
