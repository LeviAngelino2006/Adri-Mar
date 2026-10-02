import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { formatearHorarioCompacto, nombreVehiculo } from '../utils/viajeFormato';
import { etiquetaDiaRelativo, hoyEnCordoba } from '../utils/fechaCordoba';
import './Dashboard.css';

const MAX_VIAJES_INICIAL = 3;

const ICONO_VIAJE = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

const ICONO_CALENDARIO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

function ProximosViajes() {
  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    api
      .get('/viajes/mis-viajes', { params: { estado: 'PROGRAMADO', fechaDesde: hoyEnCordoba() } })
      // El backend siempre devuelve descendente (más nuevo/futuro primero);
      // acá se da vuelta para que "lo que viene" muestre el más próximo arriba.
      .then(({ data }) => setViajes([...data.viajes].reverse()))
      .finally(() => setCargando(false));
  }, []);

  const visibles = mostrarTodos ? viajes : viajes.slice(0, MAX_VIAJES_INICIAL);
  const restantes = viajes.length - MAX_VIAJES_INICIAL;

  return (
    <Card className="dashboard-panel dashboard-proximos-viajes">
      <h2>Tus próximos viajes</h2>

      {cargando && (
        <div className="loading-state">
          <Spinner label="Cargando próximos viajes" />
          <span>Cargando…</span>
        </div>
      )}

      {!cargando && viajes.length === 0 && (
        <div className="dashboard-empty">
          {ICONO_VIAJE}
          <span>No tenés viajes programados próximamente</span>
        </div>
      )}

      {!cargando && viajes.length > 0 && (
        <>
          <ul className="proximos-viajes-lista">
            {visibles.map((v) => (
              <li key={v.id} className="proximos-viajes-item">
                <div className="proximos-viajes-icono">{ICONO_CALENDARIO}</div>
                <div className="proximos-viajes-info">
                  <span className="proximos-viajes-vehiculo">{nombreVehiculo(v.vehiculo)}</span>
                  <span className="proximos-viajes-marca-modelo">
                    {v.vehiculo.marca} {v.vehiculo.modelo}
                  </span>
                  <span className="proximos-viajes-horario">{formatearHorarioCompacto(v.fechaInicio, v.fechaFin)}</span>
                </div>
                <div className="proximos-viajes-meta">
                  <span className="proximos-viajes-dia-relativo">{etiquetaDiaRelativo(v.fechaInicio)}</span>
                  <span className="proximos-viajes-km">{v.kilometrosEstimados} km estimados</span>
                </div>
              </li>
            ))}
          </ul>

          {restantes > 0 && (
            <Button variant="secondary" onClick={() => setMostrarTodos((m) => !m)}>
              {mostrarTodos ? 'Ver menos' : `Ver ${restantes} más`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function Dashboard() {
  const { usuario } = useAuth();

  return (
    <Layout>
      <h1>Panel principal</h1>
      <p className="dashboard-greeting">
        Hola, {usuario.nombre} {usuario.apellido}
      </p>

      {usuario.habilitadoParaConducir && <ProximosViajes />}

      <Card className="dashboard-panel">
        <h2>Alertas</h2>
        <div className="dashboard-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9L2.5 17a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.2 0z" />
          </svg>
          <span>Sin alertas por ahora</span>
          <span className="dashboard-empty-hint">
            Documentación vencida y vencimientos próximos van a aparecer acá
          </span>
        </div>
      </Card>
    </Layout>
  );
}

export default Dashboard;
