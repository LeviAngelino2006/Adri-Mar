import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PERFILES } from '../constants/perfiles';
import { getNavItemsHabilitados } from '../constants/navegacion';
import ConfirmModal from './ui/ConfirmModal';
import logo from '../assets/logo-adrimar.png';
import './Layout.css';

const ICONO_LOGOUT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

const ICONS = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 11h-6c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-8c0-.55-.45-1-1-1m-1 8h-4v-6h4zm-9-4H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1m-1 4H5v-2h4zM20 3h-6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1m-1 4h-4V5h4zm-9-4H4c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1m-1 8H5V5h4z" />
    </svg>
  ),
  usuarios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 20c0-1.742-1.67-3.223-4-3.773M15 20c0-2.21-2.686-4-6-4s-6 1.79-6 4m12-7a4 4 0 0 0 0-8m-6 8a4 4 0 1 1 0-8a4 4 0 0 1 0 8" />
    </svg>
  ),
  flota: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 6.021c.003-.146-.007-1.465-1.3-2.735C18.427 2.036 17.143 2 17 2H6.996c-.239 0-1.493.063-2.708 1.302C3.036 4.578 3 5.859 3 6v3H2v3h1v6c0 .734.406 1.373 1 1.721V21a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h10v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.277A1.99 1.99 0 0 0 21 18v-6h1V9h-1zM9 4h6v2H9zM6.5 18a1.5 1.5 0 1 1 .001-3.001A1.5 1.5 0 0 1 6.5 18m4.5-5H5V8h6zm6.5 5a1.5 1.5 0 1 1 .001-3.001A1.5 1.5 0 0 1 17.5 18m1.5-5h-6V8h6z" />
    </svg>
  ),
  viajes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 10s3-1.81 3-5c0-1.65-1.35-3-3-3S2 3.35 2 5c0 3.19 3 5 3 5m0-6.5c.83 0 1.5.67 1.5 1.5S5.83 6.5 5 6.5S3.5 5.83 3.5 5S4.17 3.5 5 3.5M19 14c-1.65 0-3 1.35-3 3c0 3.19 3 5 3 5s3-1.81 3-5c0-1.65-1.35-3-3-3m0 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5s-.67 1.5-1.5 1.5" />
      <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15h7c1.93 0 3.5-1.57 3.5-3.5S15.43 8 13.5 8H8v2h5.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-7C4.02 13 2 15.02 2 17.5S4.02 22 6.5 22H16v-2H6.5A2.5 2.5 0 0 1 4 17.5" />
    </svg>
  ),
  misViajes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 6h-1V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2v.5c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V21h6v.5c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V21c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m-7-2h4v2h-4zM7 19V8h10v11z" />
    </svg>
  ),
  documentacion: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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
  const [confirmandoLogout, setConfirmandoLogout] = useState(false);

  const navItems = getNavItemsHabilitados(usuario);
  const perfilLabel = PERFILES.find((p) => p.value === usuario.perfil)?.label ?? usuario.perfil;

  function cerrarMenu() {
    setMenuAbierto(false);
  }

  function handleLogout() {
    setConfirmandoLogout(false);
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
          <button
            type="button"
            className="layout-logout"
            onClick={() => setConfirmandoLogout(true)}
            aria-label="Cerrar sesión"
          >
            {ICONO_LOGOUT}
          </button>
        </div>
      </aside>

      <main className="layout-content">{children}</main>

      <ConfirmModal
        open={confirmandoLogout}
        tone="brand"
        icon={ICONO_LOGOUT}
        title="Cerrar sesión"
        description="¿Seguro que querés cerrar tu sesión?"
        confirmLabel="Cerrar sesión"
        onConfirm={handleLogout}
        onCancel={() => setConfirmandoLogout(false)}
      />
    </div>
  );
}

export default Layout;
