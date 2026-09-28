import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PERFILES } from '../constants/perfiles';
import { getFuncionesHabilitadas } from '../constants/funciones';
import logo from '../assets/logo-adrimar.jpg';
import './Layout.css';

function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const funcionesHabilitadas = getFuncionesHabilitadas(usuario.perfil);
  const perfilLabel = PERFILES.find((p) => p.value === usuario.perfil)?.label ?? usuario.perfil;

  function cerrarMenu() {
    setMenuAbierto(false);
  }

  function handleLogout() {
    cerrarMenu();
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-header-inner">
          <Link to="/" className="layout-brand" onClick={cerrarMenu}>
            <img src={logo} alt="Adri-Mar Gestión" className="layout-logo" />
          </Link>

          <button
            type="button"
            className="layout-menu-toggle"
            aria-expanded={menuAbierto}
            aria-controls="layout-nav"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <span className="sr-only">Abrir menú</span>
            <span aria-hidden="true">☰</span>
          </button>

          <nav
            id="layout-nav"
            className={`layout-nav${menuAbierto ? ' layout-nav-open' : ''}`}
            aria-label="Principal"
          >
            {funcionesHabilitadas.length > 0 && (
              <ul className="layout-nav-list">
                {funcionesHabilitadas.map((f) => (
                  <li key={f.label}>
                    <Link to={f.to} onClick={cerrarMenu}>
                      {f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="layout-user">
              <span className="layout-user-info">
                <span className="layout-user-name">
                  {usuario.nombre} {usuario.apellido}
                </span>
                <span className="layout-user-perfil">{perfilLabel}</span>
              </span>
              <button type="button" className="layout-logout" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="layout-content">{children}</main>
    </div>
  );
}

export default Layout;
