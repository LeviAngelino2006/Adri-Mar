import { useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import ModalMarco from '../documentacion/ModalMarco';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { asignarPlan } from '../../services/mantenimientoApi';
import { formatearKm } from '../../utils/viajeFormato';

// Asignar el plan de service a un vehículo que no tiene (tarjeta "Sin plan").
// La plantilla es la de su tipo de vehículo; solo se pregunta a qué km fue el
// último service (por defecto, el odómetro actual: se cuenta desde hoy).
function ModalAsignarPlan({ item, onClose, onSuccess }) {
  const { vehiculo, plantilla } = item;
  const [km, setKm] = useState(String(vehiculo.kilometraje));
  const [errorKm, setErrorKm] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [refForm, enfocarPrimerError] = useFocoEnPrimerError();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const texto = km.trim();
    let invalido = '';
    if (!texto) invalido = 'Indicá el km del último service';
    else if (!/^\d+$/.test(texto)) invalido = 'Tiene que ser un número entero, sin puntos';
    else if (Number(texto) > vehiculo.kilometraje) invalido = 'No puede superar al odómetro actual';
    setErrorKm(invalido);
    if (invalido) {
      enfocarPrimerError();
      return;
    }

    setEnviando(true);
    try {
      await asignarPlan({ vehiculoId: vehiculo.id, kmUltimoService: Number(texto) });
      onSuccess();
    } catch (err) {
      const { errores, error: mensaje } = err.response?.data ?? {};
      if (errores?.kmUltimoService) setErrorKm(errores.kmUltimoService);
      else setError(errores?.vehiculoId || mensaje || 'No se pudo asignar el plan. Intentá de nuevo.');
      enfocarPrimerError();
      setEnviando(false);
    }
  }

  return (
    <ModalMarco
      titulo="Asignar plan de service"
      subtitulo={
        <>
          {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span> · {vehiculo.marca} {vehiculo.modelo}
        </>
      }
      onClose={onClose}
      pie={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-asignar-plan" loading={enviando} disabled={!plantilla}>
            {enviando ? 'Asignando…' : 'Asignar plan'}
          </Button>
        </>
      }
    >
      <form id="form-asignar-plan" ref={refForm} className="doc-modal-form" onSubmit={handleSubmit} noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        {plantilla ? (
          <p>
            {vehiculo.tipoVehiculo}: service cada <strong className="num">{formatearKm(plantilla.intervaloKm)} km</strong>.
          </p>
        ) : (
          <Alert variant="warning">No hay una plantilla de service para el tipo de este vehículo.</Alert>
        )}

        <FormField
          id="plan-km-ultimo"
          label="Km del último service"
          required
          hint={`Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km. Si no lo sabés, dejá el odómetro actual.`}
          error={errorKm}
        >
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max={vehiculo.kilometraje}
            step="1"
            className="num"
            value={km}
            onChange={(e) => {
              setKm(e.target.value);
              setErrorKm('');
            }}
          />
        </FormField>
      </form>
    </ModalMarco>
  );
}

export default ModalAsignarPlan;
