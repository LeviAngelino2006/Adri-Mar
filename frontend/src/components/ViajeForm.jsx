import { useEffect, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import SeccionDatosAdministrativos from './SeccionDatosAdministrativos';
import { ordenarPorInterno } from '../utils/vehiculos';
import {
  CAMPOS_ADMINISTRATIVOS,
  VALORES_ADMIN_VACIOS,
  hayDatosAdministrativos,
  useCatalogosPago,
  validarMontos,
  valoresAPayload,
} from '../utils/datosAdministrativos';

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
  cantidadPasajeros: '',
};

const CAMPOS_OPERATIVOS = ['choferId', 'vehiculoId', 'fechaInicio', 'fechaFin', 'kilometrosEstimados'];
const ERROR_OBLIGATORIO_PROGRAMADO = 'Obligatorio para un viaje Programado.';
const ERROR_FECHA_INICIO = 'La fecha y hora de inicio es obligatoria';

// `estadoActual` es el estado del viaje que se está editando (undefined en
// alta). Los cinco campos operativos solo son obligatorios a nivel de
// formulario cuando se edita un viaje ya PROGRAMADO — el backend los sigue
// exigiendo ahí (ver viajeService.actualizarViaje: la obligatoriedad depende
// del estado actual, no de si el payload viene completo), así que conviene
// avisar antes de que el usuario intente guardar y se encuentre con un error
// del servidor. En alta, o editando un A_CONFIRMAR, no se exigen — con una
// excepción: la fecha de inicio es obligatoria siempre, en cualquier estado.
//
// `conDatosAdministrativos` agrega la sección colapsada de datos
// administrativos (solo alta y solo para Administrador/Encargado: lo decide
// quien monta el formulario). Si la sección queda vacía, no se manda nada; si
// tiene datos, viajan en `datosAdministrativos` dentro del mismo POST, así el
// viaje se crea completo o no se crea.
function ViajeForm({
  valoresIniciales,
  estadoActual,
  onSubmit,
  textoBoton,
  textoEnviando,
  onCancelar,
  conDatosAdministrativos = false,
}) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(valoresIniciales || FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [administrativos, setAdministrativos] = useState(VALORES_ADMIN_VACIOS);
  const [seccionAbierta, setSeccionAbierta] = useState(false);
  const { estadosPago, metodosPago, cargarCatalogos } = useCatalogosPago();

  const requiereOperativos = estadoActual === 'PROGRAMADO';

  useEffect(() => {
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api
      .get('/vehiculos', { params: { estado: 'OPERATIVO' } })
      .then(({ data }) => setVehiculos(ordenarPorInterno(data.vehiculos)));
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleChangeAdministrativo(e) {
    const { name, value } = e.target;
    setAdministrativos((a) => ({ ...a, [name]: value }));
  }

  function handleToggleSeccion(abierta) {
    setSeccionAbierta(abierta);
    // Los catálogos se piden la primera vez que se abre: quien no la abre no
    // los necesita.
    if (abierta) cargarCatalogos();
  }

  // Si hay un error adentro de la sección colapsada, se abre para que se vea.
  function mostrarErrores(nuevos) {
    setErrores(nuevos);
    if (CAMPOS_ADMINISTRATIVOS.some((campo) => nuevos[campo])) {
      handleToggleSeccion(true);
    }
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

    const erroresLocales = {};
    if (requiereOperativos) {
      for (const campo of CAMPOS_OPERATIVOS) {
        if (form[campo] === '' || form[campo] === null || form[campo] === undefined) {
          erroresLocales[campo] = ERROR_OBLIGATORIO_PROGRAMADO;
        }
      }
    }
    if (!erroresLocales.fechaInicio && !form.fechaInicio) {
      erroresLocales.fechaInicio = ERROR_FECHA_INICIO;
    }
    if (conDatosAdministrativos) {
      Object.assign(erroresLocales, validarMontos(administrativos));
    }
    if (Object.keys(erroresLocales).length > 0) {
      mostrarErrores(erroresLocales);
      return;
    }

    setEnviando(true);
    try {
      const enviarAdministrativos = conDatosAdministrativos && hayDatosAdministrativos(administrativos);
      await onSubmit(
        enviarAdministrativos ? { ...form, datosAdministrativos: valoresAPayload(administrativos) } : form
      );
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        mostrarErrores(err.response.data.errores);
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
          required
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

        <FormField id="cantidadPasajeros" label="Cantidad de pasajeros" error={errores.cantidadPasajeros}>
          <input
            type="number"
            name="cantidadPasajeros"
            min="1"
            step="1"
            value={form.cantidadPasajeros}
            onChange={handleChange}
          />
        </FormField>

        {conDatosAdministrativos && (
          <SeccionDatosAdministrativos
            valores={administrativos}
            errores={errores}
            estadosPago={estadosPago}
            metodosPago={metodosPago}
            abierta={seccionAbierta}
            onToggle={handleToggleSeccion}
            onChange={handleChangeAdministrativo}
          />
        )}
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
