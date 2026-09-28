import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/Layout';

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
        {mensaje && (
          <p role="status">
            {mensaje} <Link to="/vehiculos">Ver flota</Link>
          </p>
        )}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Layout>
  );
}

export default RegistrarVehiculo;
