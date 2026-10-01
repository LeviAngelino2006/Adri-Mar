import { useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Toast from '../components/ui/Toast';
import ViajeForm from '../components/ViajeForm';
import './ProgramarViaje.css';

function ProgramarViaje() {
  const [mensaje, setMensaje] = useState('');
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  async function handleSubmit(datos) {
    await api.post('/viajes', datos);
    setMensaje('Viaje programado correctamente.');
    // Fuerza remount de ViajeForm para limpiar el formulario tras guardar.
    setFormKey((k) => k + 1);
  }

  return (
    <Layout>
      <div className="viajes-header">
        <h1>Programar viaje</h1>
      </div>

      {mensaje && <Toast>{mensaje}</Toast>}

      <Card className="form-card">
        <ViajeForm
          key={formKey}
          onSubmit={handleSubmit}
          textoBoton="Programar viaje"
          textoEnviando="Programando…"
        />
      </Card>
    </Layout>
  );
}

export default ProgramarViaje;
