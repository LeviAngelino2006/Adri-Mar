import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RegistrarUsuario from './pages/RegistrarUsuario';
import RegistrarVehiculo from './pages/RegistrarVehiculo';
import ModificarVehiculo from './pages/ModificarVehiculo';
import FlotaVehiculos from './pages/FlotaVehiculos';
import './App.css';

function App() {
  return (
    <BrowserRouter>
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
            path="/usuarios/nuevo"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR']}>
                <RegistrarUsuario />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehiculos/nuevo"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR']}>
                <RegistrarVehiculo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehiculos"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR', 'PERSONAL_TALLER']}>
                <FlotaVehiculos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehiculos/:id/editar"
            element={
              <ProtectedRoute perfiles={['ADMINISTRADOR']}>
                <ModificarVehiculo />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
