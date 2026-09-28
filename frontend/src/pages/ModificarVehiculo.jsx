import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';
import Card from '../components/ui/Card';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';

const CAMPOS = ['dominio', 'numeroInterno', 'marca', 'modelo', 'anio', 'asientos', 'kilometraje'];

function ModificarVehiculo() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    api
      .get(`/vehiculos/${id}`)
      .then(({ data }) => {
        const inicial = {};
        CAMPOS.forEach((campo) => {
          inicial[campo] = data.vehiculo[campo];
        });
        setForm(inicial);
      })
      .catch(() => setErrorCarga('No se pudo cargar el vehículo'))
      .finally(() => setCargando(false));
  }, [id]);

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
      await api.put(`/vehiculos/${id}`, form);
      setMensaje('Cambios guardados correctamente.');
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErrores({ general: err.response.data.error });
      } else {
        setErrores({ general: 'No se pudieron guardar los cambios' });
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <Layout>
        <div className="loading-state">
          <Spinner label="Cargando vehículo" />
          <span>Cargando…</span>
        </div>
      </Layout>
    );
  }

  if (errorCarga) {
    return (
      <Layout>
        <Alert variant="error">{errorCarga}</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <p className="page-back-link">
        <Link to="/vehiculos">Volver a la flota</Link>
      </p>
      <h1>Modificar vehículo</h1>

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
          {mensaje && <Alert variant="success">{mensaje}</Alert>}

          <div className="form-actions">
            <Button type="submit" variant="primary" loading={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/vehiculos')}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

export default ModificarVehiculo;
