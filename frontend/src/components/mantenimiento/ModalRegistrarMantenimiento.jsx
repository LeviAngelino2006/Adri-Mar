import { useState, useEffect, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Alert from '../ui/Alert';
import { registrarMantenimiento } from '../../services/mantenimientoApi';
import { formatearKm } from '../../utils/viajeFormato';
import { aInputCordoba } from '../../utils/fechaCordoba';
import './ModalMantenimiento.css';

const CATEGORIAS_OPCIONES = [
  { value: 'SERVICE_PREVENTIVO', label: 'Service preventivo programado (del plan)' },
  { value: 'CAMBIO_ACEITE', label: 'Cambio de aceite y fluidos' },
  { value: 'CUBIERTAS', label: 'Neumáticos / Cubiertas' },
  { value: 'FILTROS', label: 'Sustitución de filtros (aire, aceite, comb.)' },
  { value: 'FRENOS', label: 'Frenos y pastillas' },
  { value: 'ALINEACION_BALANCEO', label: 'Alineación y balanceo' },
  { value: 'BATERIA', label: 'Batería y electricidad' },
  { value: 'MECANICA_GENERAL', label: 'Mecánica general y motor' },
  { value: 'OTRO', label: 'Otro trabajo particular' },
];

function fechaHoyInput() {
  const hoy = new Date();
  return aInputCordoba(hoy.toISOString());
}

function ModalRegistrarMantenimiento({
  abierto,
  alCerrar,
  alGuardar,
  vehiculos = [],
  vehiculoPreseleccionado = null,
  esPreventivoPorDefecto = false,
}) {
  const [vehiculoId, setVehiculoId] = useState('');
  const [categoria, setCategoria] = useState('SERVICE_PREVENTIVO');
  const [esPreventivo, setEsPreventivo] = useState(false);
  const [kilometraje, setKilometraje] = useState('');
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [repuestos, setRepuestos] = useState('');
  const [tallerMecanico, setTallerMecanico] = useState('');
  const [costo, setCosto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (abierto) {
      setError(null);
      setFecha(fechaHoyInput());
      setDescripcion('');
      setRepuestos('');
      setTallerMecanico('');
      setCosto('');
      setObservaciones('');

      if (vehiculoPreseleccionado) {
        setVehiculoId(String(vehiculoPreseleccionado.id));
        setKilometraje(String(vehiculoPreseleccionado.kilometraje || 0));
      } else {
        setVehiculoId('');
        setKilometraje('');
      }

      if (esPreventivoPorDefecto) {
        setCategoria('SERVICE_PREVENTIVO');
        setEsPreventivo(true);
      } else {
        setCategoria('CAMBIO_ACEITE');
        setEsPreventivo(false);
      }
    }
  }, [abierto, vehiculoPreseleccionado, esPreventivoPorDefecto]);

  const vehiculoSeleccionado = useMemo(() => {
    return vehiculos.find((v) => String(v.id) === String(vehiculoId)) || null;
  }, [vehiculos, vehiculoId]);

  function handleVehiculoChange(e) {
    const id = e.target.value;
    setVehiculoId(id);
    const v = vehiculos.find((veh) => String(veh.id) === String(id));
    if (v) {
      setKilometraje(String(v.kilometraje || 0));
    }
  }

  function handleCategoriaChange(e) {
    const val = e.target.value;
    setCategoria(val);
    if (val === 'SERVICE_PREVENTIVO') {
      setEsPreventivo(true);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!vehiculoId) {
      setError('Tenés que seleccionar un vehículo.');
      return;
    }
    if (!descripcion.trim()) {
      setError('La descripción de las tareas realizadas es obligatoria.');
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const payload = {
        vehiculoId: Number(vehiculoId),
        categoria,
        esServicePreventivo: Boolean(esPreventivo || categoria === 'SERVICE_PREVENTIVO'),
        fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        kilometraje: parseInt(kilometraje, 10),
        descripcion: descripcion.trim(),
        repuestos: repuestos.trim() || undefined,
        tallerMecanico: tallerMecanico.trim() || undefined,
        costo: costo ? parseFloat(costo) : undefined,
        observaciones: observaciones.trim() || undefined,
      };

      const { data } = await registrarMantenimiento(payload);
      alGuardar(data.mantenimiento);
    } catch (err) {
      const msg =
        err.response?.data?.errores?.descripcion ||
        err.response?.data?.errores?.kilometraje ||
        err.response?.data?.errores?.vehiculoId ||
        err.response?.data?.error ||
        'No se pudo registrar el mantenimiento.';
      setError(msg);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-mantenimiento-card modal-mantenimiento-card-lg">
        <Card>
          <div className="modal-header">
            <h2 className="modal-title">Registrar mantenimiento / intervención</h2>
            <button type="button" className="btn-cerrar-modal" onClick={alCerrar} aria-label="Cerrar modal">
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="form-mantenimiento">
            {error && <Alert variant="error">{error}</Alert>}

            <div className="form-grid">
              <FormField id="reg-vehiculo" label="Vehículo" required>
                <select
                  id="reg-vehiculo"
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

              <FormField id="reg-categoria" label="Tipo de trabajo / Categoría" required>
                <select id="reg-categoria" value={categoria} onChange={handleCategoriaChange}>
                  {CATEGORIAS_OPCIONES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="reg-km" label="Kilometraje al realizarlo" required>
                <input
                  id="reg-km"
                  type="number"
                  min="0"
                  step="1"
                  className="num"
                  value={kilometraje}
                  onChange={(e) => setKilometraje(e.target.value)}
                  placeholder="Ej: 115000"
                />
              </FormField>

              <FormField id="reg-fecha" label="Fecha y hora de la intervención" required>
                <input
                  id="reg-fecha"
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </FormField>
            </div>

            <div className="checkbox-preventivo-container">
              <label className="checkbox-preventivo-label">
                <input
                  type="checkbox"
                  checked={esPreventivo}
                  onChange={(e) => setEsPreventivo(e.target.checked)}
                />
                <span>
                  <strong>Registrar como el Service Preventivo del plan</strong> (recalcula automáticamente el próximo service del vehículo sumando los kilómetros de su plantilla fija).
                </span>
              </label>
            </div>

            <FormField id="reg-desc" label="Descripción de las tareas realizadas" required>
              <textarea
                id="reg-desc"
                rows="3"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detallá las tareas realizadas, componentes revisados, etc."
              />
            </FormField>

            <div className="form-grid">
              <FormField id="reg-repuestos" label="Repuestos empleados">
                <input
                  id="reg-repuestos"
                  type="text"
                  value={repuestos}
                  onChange={(e) => setRepuestos(e.target.value)}
                  placeholder="Ej: 2 cubiertas delanteras Fatecargo, 15L aceite 15W40…"
                />
              </FormField>

              <FormField id="reg-taller" label="Taller mecánico / Responsable">
                <input
                  id="reg-taller"
                  type="text"
                  value={tallerMecanico}
                  onChange={(e) => setTallerMecanico(e.target.value)}
                  placeholder="Ej: Taller Central Adri-Mar, Gomería Río Tercero…"
                />
              </FormField>

              <FormField id="reg-costo" label="Costo total ($)">
                <input
                  id="reg-costo"
                  type="number"
                  min="0"
                  step="0.01"
                  className="num"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  placeholder="Ej: 145000"
                />
              </FormField>

              <FormField id="reg-obs" label="Observaciones">
                <input
                  id="reg-obs"
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Anotaciones adicionales para la ficha clínica…"
                />
              </FormField>
            </div>

            <div className="form-actions">
              <Button type="submit" variant="primary" loading={enviando}>
                {enviando ? 'Guardando…' : 'Registrar intervención'}
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

export default ModalRegistrarMantenimiento;
