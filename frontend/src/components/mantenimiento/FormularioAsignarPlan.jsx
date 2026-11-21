import { useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import { useFocoEnPrimerError } from '../../hooks/useFocoEnPrimerError';
import { asignarPlan } from '../../services/mantenimientoApi';
import { formatearKm } from '../../utils/viajeFormato';

// Asignar el plan de service a un vehículo que no tiene ("Sin plan"), dentro
// del panel del vehículo. La plantilla es la de su tipo de vehículo; solo se
// pregunta a qué km fue el último service (por defecto, el odómetro actual: se
// cuenta desde hoy).
function FormularioAsignarPlan({ item, onCancel, onSuccess }) {
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
    <form ref={refForm} className="mantenimiento-panel-form" onSubmit={handleSubmit} noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      {plantilla ? (
        <p className="mantenimiento-panel-texto">
          {vehiculo.tipoVehiculo}: service cada <strong className="num">{formatearKm(plantilla.intervaloKm)} km</strong>.
        </p>
      ) : (
        <Alert variant="warning">No hay una plantilla de service para el tipo de este vehículo.</Alert>
      )}

      <FormField
        id="plan-km-ultimo"
        label="Km del último service"
        required
        ayuda="Si no lo sabés, dejá el odómetro actual."
        hint={`Odómetro actual: ${formatearKm(vehiculo.kilometraje)} km`}
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

      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando} disabled={!plantilla}>
          {enviando ? 'Asignando…' : 'Asignar plan'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default FormularioAsignarPlan;
