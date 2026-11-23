import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import Personal from './pages/Personal';
import FlotaVehiculos from './pages/FlotaVehiculos';
import Viajes from './pages/Viajes';
import MisViajes from './pages/MisViajes';
import ScrollAlTope from './components/ScrollAlTope';
import Documentacion from './pages/Documentacion';
import Presupuestos from './pages/Presupuestos';
import Reportes from './pages/Reportes';
import Mantenimiento from './pages/Mantenimiento';
import CambiarContrasena from './pages/CambiarContrasena';
import MiPerfil from './pages/MiPerfil';
import { RUTA_CAMBIAR_CONTRASENA, RUTA_MI_PERFIL } from './utils/sesion';
import { puedeVerViajes } from './utils/permisosViajes';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <ScrollAlTope />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personal"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Personal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Usuarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehiculos"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER']}>
                <FlotaVehiculos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documentacion"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Documentacion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/viajes"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Viajes />
              </ProtectedRoute>
            }
          />
                    <Route
            path="/mantenimiento"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER']}>
                <Mantenimiento />
              </ProtectedRoute>
            }
          />
          <Route
            path="/presupuestos"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Presupuestos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reportes"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO']}>
                <Reportes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-viajes"
            element={
              <ProtectedRoute permite={puedeVerViajes}>
                <MisViajes />
              </ProtectedRoute>
            }
          />
          <Route
            path={RUTA_CAMBIAR_CONTRASENA}
            element={
              <ProtectedRoute permiteContrasenaProvisoria>
                <CambiarContrasena />
              </ProtectedRoute>
            }
          />
          <Route
            path={RUTA_MI_PERFIL}
            element={
              <ProtectedRoute>
                <MiPerfil />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
