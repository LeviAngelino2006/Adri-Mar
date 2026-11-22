import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import EstadoCarga from '../components/ui/EstadoCarga';
import Toast from '../components/ui/Toast';
import FormularioCambiarContrasena from '../components/auth/FormularioCambiarContrasena';
import { PERFILES, PERFIL_COLORS } from '../constants/perfiles';
import { DURACION_TOAST_MS } from '../constants/toast';
import { useCarga } from '../hooks/useCarga';
import { formatearFechaCorta, formatearHora } from '../utils/viajeFormato';
import './MiPerfil.css';

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function perfilLabel(perfil) {
  return PERFILES.find((p) => p.value === perfil)?.label ?? perfil;
}

// "21 nov 2026 17:40" en hora de Córdoba; "Sin registro" si no ingresó desde
// que se registra el último ingreso.
function textoUltimoIngreso(valor) {
  return valor ? `${formatearFechaCorta(valor)} ${formatearHora(valor)}` : 'Sin registro';
}

function MiPerfil() {
  const [mensaje, setMensaje] = useState('');

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
                <div className="detalle-item">
                  <dt>Último ingreso</dt>
                  <dd>{textoUltimoIngreso(datos.ultimoIngreso)}</dd>
                </div>
              </dl>
            </Card>
          )}
        </EstadoCarga>

        <Card role="region" aria-labelledby="mi-perfil-contrasena-titulo">
          <h2 id="mi-perfil-contrasena-titulo" className="mi-perfil-titulo-seccion">
            Cambiar mi contraseña
          </h2>
          <FormularioCambiarContrasena
            disposicion="grilla"
            onExito={() => setMensaje('Contraseña cambiada correctamente.')}
          />
        </Card>
      </div>
    </Layout>
  );
}

export default MiPerfil;
