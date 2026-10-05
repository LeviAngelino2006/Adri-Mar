import { useEffect, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';

const FORM_INICIAL = {
  choferId: '',
  vehiculoId: '',
  origenId: '',
  origenNombre: '',
  destinoId: '',
  destinoNombre: '',
  fechaInicio: '',
  fechaFin: '',
  kilometrosEstimados: '',
};

function ViajeForm({ valoresIniciales, onSubmit, textoBoton, textoEnviando, onCancelar }) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(valoresIniciales || FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api.get('/vehiculos', { params: { estado: 'OPERATIVO' } }).then(({ data }) => setVehiculos(data.vehiculos));
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleSeleccionarOrigen(item) {
    setForm((f) => ({ ...f, origenId: item?.id || '', origenNombre: item?.nombre || '' }));
  }

  function handleSeleccionarDestino(item) {
    setForm((f) => ({ ...f, destinoId: item?.id || '', destinoNombre: item?.nombre || '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});
    setEnviando(true);
    try {
      await onSubmit(form);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErrores({ general: err.response.data.error });
      } else {
        setErrores({ general: 'No se pudo guardar el viaje' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
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

        <FormField id="origenId" label="Origen" error={errores.origenId}>
          <SelectorBuscarOCrear
            endpoint="/ubicaciones"
            valor={form.origenId}
            valorNombre={form.origenNombre}
            onSeleccionar={handleSeleccionarOrigen}
            placeholder="Buscar o crear ubicación…"
          />
        </FormField>

        <FormField id="destinoId" label="Destino" error={errores.destinoId}>
          <SelectorBuscarOCrear
            endpoint="/ubicaciones"
            valor={form.destinoId}
            valorNombre={form.destinoNombre}
            onSeleccionar={handleSeleccionarDestino}
            placeholder="Buscar o crear ubicación…"
          />
        </FormField>

        <FormField id="fechaInicio" label="Fecha y hora de inicio" error={errores.fechaInicio}>
          <input type="datetime-local" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
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
          {enviando ? textoEnviando : textoBoton}
        </Button>
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

export default ViajeForm;
