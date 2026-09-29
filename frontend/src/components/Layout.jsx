import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PERFILES } from '../constants/perfiles';
import { getNavItemsHabilitados } from '../constants/navegacion';
import logo from '../assets/logo-adrimar.png';
import './Layout.css';

const ICONS = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  usuarios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" />
    </svg>
  ),
  flota: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="10" rx="2" />
      <path d="M2.5 11h19" />
      <circle cx="7" cy="18.5" r="1.6" />
      <circle cx="17" cy="18.5" r="1.6" />
    </svg>
  ),
};

function initials(nombre, apellido) {
  return `${(nombre || '').charAt(0)}${(apellido || '').charAt(0)}`.toUpperCase();
}

function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const navItems = getNavItemsHabilitados(usuario.perfil);
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
      <header className="layout-topbar">
        <button
          type="button"
          className="layout-menu-toggle"
          aria-expanded={menuAbierto}
          aria-controls="layout-sidebar"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
        >
          <span className="sr-only">{menuAbierto ? 'Cerrar menú' : 'Abrir menú'}</span>
          <span aria-hidden="true">☰</span>
        </button>
        <img src={logo} alt="Adri-Mar Gestión" className="layout-topbar-logo" />
      </header>

      {menuAbierto && (
        <div className="layout-backdrop" onClick={cerrarMenu} aria-hidden="true" />
      )}

      <aside id="layout-sidebar" className={`layout-sidebar${menuAbierto ? ' layout-sidebar-open' : ''}`}>
        <div className="layout-sidebar-brand">
          <img src={logo} alt="Adri-Mar Gestión" className="layout-logo" />
        </div>

        <nav className="layout-nav" aria-label="Principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={cerrarMenu}
              className={({ isActive }) => `layout-nav-link${isActive ? ' is-active' : ''}`}
            >
              {ICONS[item.icon]}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="layout-sidebar-footer">
          <span className="layout-user-avatar" aria-hidden="true">
            {initials(usuario.nombre, usuario.apellido)}
          </span>
          <span className="layout-user-info">
            <span className="layout-user-name">
              {usuario.nombre} {usuario.apellido}
            </span>
            <span className="layout-user-perfil">{perfilLabel}</span>
          </span>
          <button type="button" className="layout-logout" onClick={handleLogout} aria-label="Cerrar sesión">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="layout-content">{children}</main>
    </div>
  );
}

export default Layout;
