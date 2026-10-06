import { useEffect, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';

const FORM_INICIAL = {
  clienteId: '',
  clienteNombre: '',
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

const CAMPOS_OPERATIVOS = ['choferId', 'vehiculoId', 'fechaInicio', 'fechaFin', 'kilometrosEstimados'];
const ERROR_OBLIGATORIO_PROGRAMADO = 'Obligatorio para un viaje Programado.';
const LEYENDA_TODO_OBLIGATORIO = '* Obligatorio';
const LEYENDA_OPERATIVOS_OPCIONALES =
  '* Obligatorio. Si completás chofer, vehículo, fechas y kilómetros, el viaje queda Programado; si no, queda A confirmar.';

// `estadoActual` es el estado del viaje que se está editando (undefined en
// alta). Los cinco campos operativos solo son obligatorios a nivel de
// formulario cuando se edita un viaje ya PROGRAMADO — el backend los sigue
// exigiendo ahí (ver viajeService.actualizarViaje: la obligatoriedad depende
// del estado actual, no de si el payload viene completo), así que conviene
// avisar antes de que el usuario intente guardar y se encuentre con un error
// del servidor. En alta, o editando un A_CONFIRMAR, nunca se exigen.
function ViajeForm({ valoresIniciales, estadoActual, onSubmit, textoBoton, textoEnviando, onCancelar }) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(valoresIniciales || FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const requiereOperativos = estadoActual === 'PROGRAMADO';

  useEffect(() => {
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api.get('/vehiculos', { params: { estado: 'OPERATIVO' } }).then(({ data }) => setVehiculos(data.vehiculos));
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleSeleccionarCliente(item) {
    setForm((f) => ({ ...f, clienteId: item?.id || '', clienteNombre: item?.nombre || '' }));
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

    if (requiereOperativos) {
      const erroresLocales = {};
      for (const campo of CAMPOS_OPERATIVOS) {
        if (form[campo] === '' || form[campo] === null || form[campo] === undefined) {
          erroresLocales[campo] = ERROR_OBLIGATORIO_PROGRAMADO;
        }
      }
      if (Object.keys(erroresLocales).length > 0) {
        setErrores(erroresLocales);
        return;
      }
    }

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
        <div className="form-field-ancho">
          <FormField id="clienteId" label="Cliente" error={errores.clienteId} required>
            <SelectorBuscarOCrear
              endpoint="/clientes"
              valor={form.clienteId}
              valorNombre={form.clienteNombre}
              onSeleccionar={handleSeleccionarCliente}
              placeholder="Buscar o crear cliente…"
            />
          </FormField>
        </div>

        <FormField id="origenId" label="Origen" error={errores.origenId} required>
          <SelectorBuscarOCrear
            endpoint="/ubicaciones"
            valor={form.origenId}
            valorNombre={form.origenNombre}
            onSeleccionar={handleSeleccionarOrigen}
            placeholder="Buscar o crear ubicación…"
          />
        </FormField>

        <FormField id="destinoId" label="Destino" error={errores.destinoId} required>
          <SelectorBuscarOCrear
            endpoint="/ubicaciones"
            valor={form.destinoId}
            valorNombre={form.destinoNombre}
            onSeleccionar={handleSeleccionarDestino}
            placeholder="Buscar o crear ubicación…"
          />
        </FormField>

        <FormField
          id="fechaInicio"
          label="Fecha y hora de inicio"
          error={errores.fechaInicio}
          required={requiereOperativos}
        >
          <input type="datetime-local" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
        </FormField>

        <FormField
          id="fechaFin"
          label="Fecha y hora de fin"
          error={errores.fechaFin}
          required={requiereOperativos}
        >
          <input type="datetime-local" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
        </FormField>

        <FormField id="choferId" label="Chofer" error={errores.choferId} required={requiereOperativos}>
          <select name="choferId" value={form.choferId} onChange={handleChange}>
            <option value="">Seleccionar…</option>
            {choferes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.apellido}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="vehiculoId" label="Vehículo" error={errores.vehiculoId} required={requiereOperativos}>
          <select name="vehiculoId" value={form.vehiculoId} onChange={handleChange}>
            <option value="">Seleccionar…</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.numeroInterno} - {v.dominio}
              </option>
            ))}
          </select>
        </FormField>

        <div className="form-field-ancho">
          <FormField
            id="kilometrosEstimados"
            label="Kilómetros estimados"
            error={errores.kilometrosEstimados}
            required={requiereOperativos}
          >
            <input
              type="number"
              name="kilometrosEstimados"
              value={form.kilometrosEstimados}
              onChange={handleChange}
            />
          </FormField>
        </div>
      </div>

      {errores.general && <Alert variant="error">{errores.general}</Alert>}

      <p className="form-leyenda">{requiereOperativos ? LEYENDA_TODO_OBLIGATORIO : LEYENDA_OPERATIVOS_OPCIONALES}</p>

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
