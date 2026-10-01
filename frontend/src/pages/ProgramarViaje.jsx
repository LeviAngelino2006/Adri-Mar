import { useEffect, useState } from 'react';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import FormField from '../components/ui/FormField';
import Alert from '../components/ui/Alert';
import Toast from '../components/ui/Toast';
import './ProgramarViaje.css';

const FORM_INICIAL = {
  choferId: '',
  vehiculoId: '',
  fechaInicio: '',
  fechaFin: '',
  kilometrosEstimados: '',
};

function ProgramarViaje() {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api.get('/vehiculos', { params: { estado: 'OPERATIVO' } }).then(({ data }) => setVehiculos(data.vehiculos));
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(''), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/viajes', form);
      setMensaje('Viaje programado correctamente.');
      setForm(FORM_INICIAL);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: 'No se pudo programar el viaje' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Layout>
      <div className="viajes-header">
        <h1>Programar viaje</h1>
      </div>

      {mensaje && <Toast>{mensaje}</Toast>}

      <Card className="form-card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <FormField id="choferId" label="Chofer" error={errores.choferId}>
              <select name="choferId" value={form.choferId} onChange={handleChange}>
                <option value="">Seleccionar…</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="vehiculoId" label="Vehículo" error={errores.vehiculoId}>
              <select name="vehiculoId" value={form.vehiculoId} onChange={handleChange}>
                <option value="">Seleccionar…</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.numeroInterno} - {v.dominio}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="fechaInicio" label="Fecha y hora de inicio" error={errores.fechaInicio}>
              <input
                type="datetime-local"
                name="fechaInicio"
                value={form.fechaInicio}
                onChange={handleChange}
              />
            </FormField>

            <FormField id="fechaFin" label="Fecha y hora de fin" error={errores.fechaFin}>
              <input type="datetime-local" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
            </FormField>

            <FormField id="kilometrosEstimados" label="Kilómetros estimados" error={errores.kilometrosEstimados}>
              <input
                type="number"
                name="kilometrosEstimados"
                value={form.kilometrosEstimados}
                onChange={handleChange}
              />
            </FormField>
          </div>

          {errores.general && <Alert variant="error">{errores.general}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Programando…' : 'Programar viaje'}
            </Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

export default ProgramarViaje;
