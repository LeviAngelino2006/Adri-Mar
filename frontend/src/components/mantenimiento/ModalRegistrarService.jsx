import { useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import OpcionVacia from '../ui/OpcionVacia';
import ModalMarco from '../documentacion/ModalMarco';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { registrarService } from '../../services/mantenimientoApi';
import { MAX_TEXTO_MANTENIMIENTO, TAREAS_SERVICE } from '../../constants/mantenimiento';
import { hoyCordobaISO } from '../../utils/fechaCordoba';
import { formatearKm } from '../../utils/viajeFormato';
import { etiquetaVehiculo, textoIncluyeService, validarRegistroMantenimiento } from '../../utils/mantenimiento';

// Registrar un service: fecha, km del odómetro y observación. El service es
// siempre el paquete completo (TAREAS_SERVICE), que se muestra en una oración
// como ayuda de la observación. Si el vehículo viene elegido (desde su tarjeta)
// no se pregunta.
// Se monta solo mientras está abierto, así arranca siempre limpio.
function ModalRegistrarService({ vehiculos, vehiculo: elegido = null, onClose, onSuccess }) {
  const hoy = hoyCordobaISO();
  const [form, setForm] = useState({
    vehiculoId: elegido ? String(elegido.vehiculo.id) : '',
    fecha: hoy,
    kilometraje: '',
    observaciones: '',
  });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  const vehiculo = elegido?.vehiculo ?? vehiculos.find((item) => String(item.vehiculo.id) === form.vehiculoId)?.vehiculo;
  const cantidadObservacion = [...form.observaciones].length;

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const invalidos = validarRegistroMantenimiento(form, { hoy, maxTexto: MAX_TEXTO_MANTENIMIENTO });
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      const { data } = await registrarService({
        vehiculoId: Number(form.vehiculoId),
        fecha: form.fecha,
        kilometraje: Number(form.kilometraje),
        observaciones: form.observaciones.trim() || undefined,
      });
      onSuccess(data.registro);
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        // Lo que no tiene campo en el formulario va como mensaje general.
        const { vehiculoId, fecha, kilometraje, observaciones, ...otros } = delBackend;
        setErrores({ vehiculoId: elegido ? undefined : vehiculoId, fecha, kilometraje, observaciones });
        const general = [elegido ? vehiculoId : null, ...Object.values(otros)].filter(Boolean).join(' ');
        if (general) setError(general);
      } else {
        setError(mensaje || 'No se pudo registrar el service. Intentá de nuevo.');
      }
      enfocarPrimerError();
      setEnviando(false);
    }
  }

  return (
    <ModalMarco
      titulo="Registrar service"
      subtitulo={
        elegido ? (
          <>
            {elegido.vehiculo.numeroInterno} - <span className="patente">{elegido.vehiculo.dominio}</span> ·{' '}
            {elegido.vehiculo.marca} {elegido.vehiculo.modelo}
          </>
        ) : null
      }
      onClose={onClose}
      pie={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-service" loading={enviando}>
            {enviando ? 'Registrando…' : 'Registrar service'}
          </Button>
        </>
      }
    >
      <form id="form-service" ref={refForm} className="doc-modal-form" onSubmit={handleSubmit} noValidate>
        {error && <Alert variant="error">{error}</Alert>}

        {!elegido && (
          <FormField id="service-vehiculo" label="Vehículo" required error={errores.vehiculoId}>
            <select value={form.vehiculoId} onChange={(e) => cambiar('vehiculoId', e.target.value)}>
              <OpcionVacia obligatorio>Elegí el vehículo</OpcionVacia>
              {vehiculos.map((item) => (
                <option key={item.vehiculo.id} value={item.vehiculo.id}>
                  {etiquetaVehiculo(item.vehiculo)}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <div className="form-grid">
          <FormField id="service-fecha" label="Fecha" required error={errores.fecha}>
            <input type="date" max={hoy} value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
          </FormField>

          <FormField
            id="service-km"
            label="Km del odómetro"
            required
            hint={vehiculo ? `Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km` : 'En kilómetros'}
            error={errores.kilometraje}
          >
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              className="num"
              value={form.kilometraje}
              onChange={(e) => cambiar('kilometraje', e.target.value)}
            />
          </FormField>
        </div>

        <FormField
          id="service-observaciones"
          label={
            <>
              Observación{' '}
              <span
                className={
                  cantidadObservacion > MAX_TEXTO_MANTENIMIENTO ? 'contador-texto contador-texto-excedido' : 'contador-texto'
                }
              >
                {cantidadObservacion}/{MAX_TEXTO_MANTENIMIENTO}
              </span>
            </>
          }
          hint={textoIncluyeService(TAREAS_SERVICE)}
          error={errores.observaciones}
        >
          <textarea
            rows={3}
            placeholder="Algo para destacar del service"
            value={form.observaciones}
            onChange={(e) => cambiar('observaciones', e.target.value)}
          />
        </FormField>
      </form>
    </ModalMarco>
  );
}

export default ModalRegistrarService;
