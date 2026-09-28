import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import { getFuncionesHabilitadas } from '../constants/funciones';

function Dashboard() {
  const { usuario } = useAuth();

  const funcionesHabilitadas = getFuncionesHabilitadas(usuario.perfil);

  return (
    <Layout>
      <h1>Panel principal</h1>
      <p>
        Hola, {usuario.nombre} {usuario.apellido} ({usuario.perfil})
      </p>
      <ul>
        {funcionesHabilitadas.map((f) => (
          <li key={f.label}>{f.to ? <Link to={f.to}>{f.label}</Link> : f.label}</li>
        ))}
      </ul>
    </Layout>
  );
}

export default Dashboard;
