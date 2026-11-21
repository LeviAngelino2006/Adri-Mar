import { useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { registrarService } from '../../services/mantenimientoApi';
import { MAX_TEXTO_MANTENIMIENTO, TAREAS_SERVICE } from '../../constants/mantenimiento';
import { hoyCordobaISO } from '../../utils/fechaCordoba';
import { formatearKm } from '../../utils/viajeFormato';
import { textoIncluyeService, validarRegistroMantenimiento } from '../../utils/mantenimiento';

// Registrar un service del vehículo del panel: fecha, km del odómetro y
// observación. El service es siempre el paquete completo (TAREAS_SERVICE), que
// se muestra en una oración como ayuda de la observación. Se monta solo
// mientras se ve, así arranca siempre limpio.
function FormularioService({ item, onCancel, onSuccess }) {
  const { vehiculo } = item;
  const hoy = hoyCordobaISO();
  const [form, setForm] = useState({
    vehiculoId: String(vehiculo.id),
    fecha: hoy,
    kilometraje: '',
    observaciones: '',
  });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

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
        vehiculoId: vehiculo.id,
        fecha: form.fecha,
        kilometraje: Number(form.kilometraje),
        observaciones: form.observaciones.trim() || undefined,
      });
      onSuccess(data.registro);
    } catch (err) {
      const { errores: delBackend, error: mensaje } = err.response?.data ?? {};
      if (delBackend) {
        // Lo que no tiene campo en el formulario (el vehículo, por ejemplo) va
        // como mensaje general.
        const { fecha, kilometraje, observaciones, ...otros } = delBackend;
        setErrores({ fecha, kilometraje, observaciones });
        const general = Object.values(otros).filter(Boolean).join(' ');
        if (general) setError(general);
      } else {
        setError(mensaje || 'No se pudo registrar el service. Intentá de nuevo.');
      }
      enfocarPrimerError();
      setEnviando(false);
    }
  }

  return (
    <form ref={refForm} className="mantenimiento-panel-form" onSubmit={handleSubmit} noValidate>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="form-grid">
        <FormField id="service-fecha" label="Fecha" required error={errores.fecha}>
          <input type="date" max={hoy} value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
        </FormField>

        <FormField
          id="service-km"
          label="Km del odómetro"
          required
          hint={`Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km`}
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

        <div className="form-field-ancho">
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
            ayuda={textoIncluyeService(TAREAS_SERVICE)}
            error={errores.observaciones}
          >
            <textarea
              rows={3}
              placeholder="Algo para destacar del service"
              value={form.observaciones}
              onChange={(e) => cambiar('observaciones', e.target.value)}
            />
          </FormField>
        </div>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando}>
          {enviando ? 'Registrando…' : 'Registrar service'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default FormularioService;
