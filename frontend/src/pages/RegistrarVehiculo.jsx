import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';

const FORM_INICIAL = {
  dominio: '',
  numeroInterno: '',
  marca: '',
  modelo: '',
  anio: '',
  asientos: '',
  kilometraje: '',
};

function RegistrarVehiculo() {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/vehiculos', form);
      setMensaje('Vehículo registrado correctamente.');
      setForm(FORM_INICIAL);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else {
        setErrores({ general: 'No se pudo registrar el vehículo' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Layout>
      <p className="page-back-link">
        <Link to="/">Volver</Link>
      </p>
      <h1>Registrar vehículo</h1>

      <Card className="form-card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <FormField id="dominio" label="Dominio" error={errores.dominio}>
              <input name="dominio" value={form.dominio} onChange={handleChange} />
            </FormField>

            <FormField id="numeroInterno" label="Número de interno" error={errores.numeroInterno}>
              <input name="numeroInterno" value={form.numeroInterno} onChange={handleChange} />
            </FormField>

            <FormField id="marca" label="Marca" error={errores.marca}>
              <input name="marca" value={form.marca} onChange={handleChange} />
            </FormField>

            <FormField id="modelo" label="Modelo" error={errores.modelo}>
              <input name="modelo" value={form.modelo} onChange={handleChange} />
            </FormField>

            <FormField id="anio" label="Año" error={errores.anio}>
              <input name="anio" type="number" value={form.anio} onChange={handleChange} />
            </FormField>

            <FormField id="asientos" label="Cantidad de asientos" error={errores.asientos}>
              <input name="asientos" type="number" value={form.asientos} onChange={handleChange} />
            </FormField>

            <FormField id="kilometraje" label="Kilometraje actual" error={errores.kilometraje}>
              <input name="kilometraje" type="number" value={form.kilometraje} onChange={handleChange} />
            </FormField>
          </div>

          {errores.general && <Alert variant="error">{errores.general}</Alert>}
          {mensaje && (
            <Alert variant="success">
              {mensaje} <Link to="/vehiculos">Ver flota</Link>
            </Alert>
          )}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

export default RegistrarVehiculo;
