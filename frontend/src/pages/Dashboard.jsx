import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import './Dashboard.css';

function Dashboard() {
  const { usuario } = useAuth();

  return (
    <Layout>
      <h1>Panel principal</h1>
      <p className="dashboard-greeting">
        Hola, {usuario.nombre} {usuario.apellido}
      </p>

      <div className="dashboard-panels">
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

        <Card className="dashboard-panel">
          <h2>Actividad reciente</h2>
          <div className="dashboard-empty">
            <span>Sin actividad reciente</span>
          </div>
        </Card>
      </div>
    </Layout>
  );
}

export default Dashboard;
