import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';

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
        <p>Cargando…</p>
      </Layout>
    );
  }

  if (errorCarga) {
    return (
      <Layout>
        <p role="alert">{errorCarga}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <p className="page-back-link">
        <Link to="/vehiculos">Volver a la flota</Link>
      </p>
      <h1>Modificar vehículo</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="dominio">Dominio</label>
          <input id="dominio" name="dominio" value={form.dominio} onChange={handleChange} />
          {errores.dominio && <p role="alert">{errores.dominio}</p>}
        </div>
        <div>
          <label htmlFor="numeroInterno">Número de interno</label>
          <input
            id="numeroInterno"
            name="numeroInterno"
            value={form.numeroInterno}
            onChange={handleChange}
          />
          {errores.numeroInterno && <p role="alert">{errores.numeroInterno}</p>}
        </div>
        <div>
          <label htmlFor="marca">Marca</label>
          <input id="marca" name="marca" value={form.marca} onChange={handleChange} />
          {errores.marca && <p role="alert">{errores.marca}</p>}
        </div>
        <div>
          <label htmlFor="modelo">Modelo</label>
          <input id="modelo" name="modelo" value={form.modelo} onChange={handleChange} />
          {errores.modelo && <p role="alert">{errores.modelo}</p>}
        </div>
        <div>
          <label htmlFor="anio">Año</label>
          <input id="anio" name="anio" type="number" value={form.anio} onChange={handleChange} />
          {errores.anio && <p role="alert">{errores.anio}</p>}
        </div>
        <div>
          <label htmlFor="asientos">Cantidad de asientos</label>
          <input
            id="asientos"
            name="asientos"
            type="number"
            value={form.asientos}
            onChange={handleChange}
          />
          {errores.asientos && <p role="alert">{errores.asientos}</p>}
        </div>
        <div>
          <label htmlFor="kilometraje">Kilometraje actual</label>
          <input
            id="kilometraje"
            name="kilometraje"
            type="number"
            value={form.kilometraje}
            onChange={handleChange}
          />
          {errores.kilometraje && <p role="alert">{errores.kilometraje}</p>}
        </div>
        {errores.general && <p role="alert">{errores.general}</p>}
        {mensaje && <p role="status">{mensaje}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => navigate('/vehiculos')}>
          Cancelar
        </button>
      </form>
    </Layout>
  );
}

export default ModificarVehiculo;
