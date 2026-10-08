import { useEffect, useState } from 'react';
import api from '../services/api';
import ConfirmModal from './ui/ConfirmModal';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import { confirmarViaje } from '../services/viajesApi';
import { aInputCordoba } from '../utils/fechaCordoba';

const ICONO_CONFIRMAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const FORM_VACIO = {
  choferId: '',
  vehiculoId: '',
  fechaInicio: '',
  fechaFin: '',
  kilometrosEstimados: '',
};

// Completa los cinco campos operativos que todavía falten en un viaje
// A_CONFIRMAR y llama a PATCH /viajes/:id/confirmar, que corre la validación
// completa (habilitación + solapamiento) y transiciona el viaje a
// PROGRAMADO. Pre-carga lo que ya esté guardado en el viaje; lo que falte
// queda vacío para completarlo acá.
function ModalConfirmarViaje({ viaje, onCerrar, onExito }) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const viajeId = viaje?.id;

  useEffect(() => {
    if (!viajeId) return;
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api.get('/vehiculos', { params: { estado: 'OPERATIVO' } }).then(({ data }) => setVehiculos(data.vehiculos));
  }, [viajeId]);

  useEffect(() => {
    if (!viaje) return;
    setForm({
      choferId: viaje.choferId || '',
      vehiculoId: viaje.vehiculoId || '',
      fechaInicio: aInputCordoba(viaje.fechaInicio),
      fechaFin: aInputCordoba(viaje.fechaFin),
      kilometrosEstimados: viaje.kilometrosEstimados ?? '',
    });
    setErrores({});
  }, [viaje]);

  if (!viaje) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function confirmar() {
    setErrores({});
    setEnviando(true);
    try {
      const { data } = await confirmarViaje(viaje.id, form);
      onExito(data.viaje);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErrores({ general: err.response.data.error });
      } else {
        setErrores({ general: 'No se pudo confirmar el viaje' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmModal
      open={Boolean(viaje)}
      tone="brand"
      icon={ICONO_CONFIRMAR}
      title="Confirmar viaje"
      description={
        <>
          <FormField id="confirmar-choferId" label="Chofer" error={errores.choferId}>
            <select name="choferId" value={form.choferId} onChange={handleChange}>
              <option value="">Seleccionar…</option>
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellido}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="confirmar-vehiculoId" label="Vehículo" error={errores.vehiculoId}>
            <select name="vehiculoId" value={form.vehiculoId} onChange={handleChange}>
              <option value="">Seleccionar…</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.numeroInterno} - {v.dominio}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="confirmar-fechaInicio" label="Fecha y hora de inicio" error={errores.fechaInicio}>
            <input type="datetime-local" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
          </FormField>

          <FormField id="confirmar-fechaFin" label="Fecha y hora de fin" error={errores.fechaFin}>
            <input type="datetime-local" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
          </FormField>

          <FormField id="confirmar-kilometrosEstimados" label="Kilómetros estimados" error={errores.kilometrosEstimados}>
            <input
              type="number"
              name="kilometrosEstimados"
              value={form.kilometrosEstimados}
              onChange={handleChange}
            />
          </FormField>

          {errores.general && <Alert variant="error">{errores.general}</Alert>}
        </>
      }
      confirmLabel={enviando ? 'Confirmando…' : 'Confirmar viaje'}
      onConfirm={confirmar}
      onCancel={onCerrar}
    />
  );
}

export default ModalConfirmarViaje;
