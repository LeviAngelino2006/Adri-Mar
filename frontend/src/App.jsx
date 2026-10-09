import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import FlotaVehiculos from './pages/FlotaVehiculos';
import Viajes from './pages/Viajes';
import MisViajes from './pages/MisViajes';
import ScrollAlTope from './components/ScrollAlTope';
import Documentacion from './pages/Documentacion';
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
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'ENCARGADO', 'PERSONAL_TALLER']}>
                <Viajes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mis-viajes"
            element={
              <ProtectedRoute>
                <MisViajes />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
