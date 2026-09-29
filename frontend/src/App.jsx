import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
