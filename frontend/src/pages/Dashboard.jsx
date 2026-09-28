import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import { getFuncionesHabilitadas } from '../constants/funciones';
import { PERFILES } from '../constants/perfiles';
import './Dashboard.css';

function Dashboard() {
  const { usuario } = useAuth();

  const funcionesHabilitadas = getFuncionesHabilitadas(usuario.perfil);
  const perfilLabel = PERFILES.find((p) => p.value === usuario.perfil)?.label ?? usuario.perfil;

  return (
    <Layout>
      <h1>Panel principal</h1>
      <p className="dashboard-greeting">
        Hola, {usuario.nombre} {usuario.apellido} · {perfilLabel}
      </p>

      <div className="dashboard-grid">
        {funcionesHabilitadas.map((f) => (
          <Card className="dashboard-card" key={f.label}>
            <h2>
              {f.to ? (
                <Link to={f.to} className="dashboard-card-link">
                  {f.label}
                </Link>
              ) : (
                f.label
              )}
            </h2>
            {f.descripcion && <p>{f.descripcion}</p>}
          </Card>
        ))}
      </div>
    </Layout>
  );
}

export default Dashboard;
