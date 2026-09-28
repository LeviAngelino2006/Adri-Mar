import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FUNCIONES = [
  { label: 'Gestionar usuarios', perfiles: ['ADMINISTRADOR'], to: '/usuarios/nuevo' },
  { label: 'Registrar vehículo', perfiles: ['ADMINISTRADOR'], to: '/vehiculos/nuevo' },
  {
    label: 'Consultar flota de vehículos',
    perfiles: ['ADMINISTRADOR', 'PERSONAL_TALLER'],
    to: '/vehiculos',
  },
];

function Dashboard() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const funcionesHabilitadas = FUNCIONES.filter((f) => f.perfiles.includes(usuario.perfil));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <main>
      <h1>Adri-Mar Gestión</h1>
      <p>
        Hola, {usuario.nombre} {usuario.apellido} ({usuario.perfil})
      </p>
      <ul>
        {funcionesHabilitadas.map((f) => (
          <li key={f.label}>{f.to ? <Link to={f.to}>{f.label}</Link> : f.label}</li>
        ))}
      </ul>
      <button onClick={handleLogout}>Cerrar sesión</button>
    </main>
  );
}

export default Dashboard;
