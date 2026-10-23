import { useState, useEffect, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Alert from '../ui/Alert';
import { asignarPlan } from '../../services/mantenimientoApi';
import { formatearKm } from '../../utils/viajeFormato';
import './ModalMantenimiento.css';

function ModalAsignarPlan({ abierto, alCerrar, alGuardar, vehiculos = [], plantillas = [], vehiculoPreseleccionado = null }) {
  const [vehiculoId, setVehiculoId] = useState('');
  const [kmUltimoService, setKmUltimoService] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (abierto) {
      setError(null);
      if (vehiculoPreseleccionado) {
        setVehiculoId(String(vehiculoPreseleccionado.id));
        setKmUltimoService(String(vehiculoPreseleccionado.kilometraje || 0));
      } else {
        setVehiculoId('');
        setKmUltimoService('');
      }
    }
  }, [abierto, vehiculoPreseleccionado]);

  const vehiculoSeleccionado = useMemo(() => {
    return vehiculos.find((v) => String(v.id) === String(vehiculoId)) || null;
  }, [vehiculos, vehiculoId]);

  // Buscar la plantilla asociada al tipo de vehículo
  const plantillaSugerida = useMemo(() => {
    if (!vehiculoSeleccionado) return null;
    return plantillas.find((p) => p.tipoVehiculoId === vehiculoSeleccionado.tipoVehiculoId) || null;
  }, [vehiculoSeleccionado, plantillas]);

  const kmBaseNum = parseInt(kmUltimoService, 10);
  const kmProximoEstimado =
    !isNaN(kmBaseNum) && plantillaSugerida ? kmBaseNum + plantillaSugerida.intervaloKm : null;

  function handleVehiculoChange(e) {
    const id = e.target.value;
    setVehiculoId(id);
    const v = vehiculos.find((veh) => String(veh.id) === String(id));
    if (v) {
      setKmUltimoService(String(v.kilometraje || 0));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!vehiculoId) {
      setError('Tenés que seleccionar un vehículo.');
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const { data } = await asignarPlan({
        vehiculoId: Number(vehiculoId),
        kmUltimoService: kmBaseNum,
        plantillaMantenimientoId: plantillaSugerida ? plantillaSugerida.id : undefined,
      });
      alGuardar(data.plan);
    } catch (err) {
      const msg =
        err.response?.data?.errores?.vehiculoId ||
        err.response?.data?.errores?.kmUltimoService ||
        err.response?.data?.error ||
        'No se pudo asignar el plan de mantenimiento.';
      setError(msg);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-mantenimiento-card">
        <Card>
          <div className="modal-header">
            <h2 className="modal-title">Asignar plan de mantenimiento</h2>
            <button type="button" className="btn-cerrar-modal" onClick={alCerrar} aria-label="Cerrar modal">
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="form-mantenimiento">
            {error && <Alert variant="error">{error}</Alert>}

            <FormField id="modal-vehiculo" label="Vehículo" required>
              <select
                id="modal-vehiculo"
                value={vehiculoId}
                onChange={handleVehiculoChange}
                disabled={Boolean(vehiculoPreseleccionado)}
              >
                <option value="">Seleccionar vehículo…</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    Interno {v.numeroInterno} — {v.dominio} ({v.tipoVehiculo?.descripcion || 'Vehículo'})
                  </option>
                ))}
              </select>
            </FormField>

            {plantillaSugerida && (
              <div className="info-plantilla-box">
                <div className="info-plantilla-label">Plantilla fija asignada:</div>
                <div className="info-plantilla-nombre">{plantillaSugerida.nombre}</div>
                <div className="info-plantilla-desc">
                  Este vehículo realizará su service preventivo fijo cada{' '}
                  <strong className="num">{formatearKm(plantillaSugerida.intervaloKm)} km</strong>.
                </div>
              </div>
            )}

            <FormField
              id="modal-km-ultimo"
              label="Kilometraje del último service"
              hint="Odómetro en el que se realizó el último mantenimiento preventivo."
              required
            >
              <input
                id="modal-km-ultimo"
                type="number"
                min="0"
                step="1"
                className="num"
                value={kmUltimoService}
                onChange={(e) => setKmUltimoService(e.target.value)}
                placeholder="Ej: 85000"
              />
            </FormField>

            {kmProximoEstimado !== null && (
              <div className="calculo-proximo-box">
                Próximo service programado a los:{' '}
                <span className="num highlight-km">{formatearKm(kmProximoEstimado)} km</span>
              </div>
            )}

            <div className="form-actions">
              <Button type="submit" variant="primary" loading={enviando}>
                {enviando ? 'Guardando…' : 'Asignar plan'}
              </Button>
              <Button type="button" variant="secondary" onClick={alCerrar} disabled={enviando}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default ModalAsignarPlan;
