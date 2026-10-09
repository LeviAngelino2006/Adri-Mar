import { useEffect, useState } from 'react';
import api from '../services/api';
import ConfirmModal from './ui/ConfirmModal';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SeleccionCandidato from './SeleccionCandidato';
import { confirmarViaje, disponibilidadDeViaje } from '../services/viajesApi';
import { aInputCordoba } from '../utils/fechaCordoba';
import { nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import { ordenarPorInterno } from '../utils/vehiculos';

const ICONO_CONFIRMAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const FORM_VACIO = {
  fechaInicio: '',
  fechaFin: '',
  kilometrosEstimados: '',
};

const SELECCION_VACIA = { opcion: '', otroId: '' };

// Sin candidatos no hay radios: se muestra directamente el select ("otro").
const seleccionInicial = (candidatos) => (candidatos.length > 0 ? SELECCION_VACIA : { opcion: 'otro', otroId: '' });

const idElegido = (seleccion) => (seleccion.opcion === 'otro' ? seleccion.otroId : seleccion.opcion);

const porId = (lista) => Object.fromEntries(lista.map((item) => [item.id, item]));

// Elige un chofer y un vehículo para un viaje A_CONFIRMAR y llama a
// PATCH /viajes/:id/confirmar, que corre la validación completa (habilitación +
// solapamiento), lo pasa a PROGRAMADO y borra los candidatos. Fechas y km se
// precargan del viaje y son obligatorios.
//
// Los candidatos se ofrecen como radios; los que la disponibilidad marca como
// no disponibles quedan deshabilitados con su motivo. "Elegir otro…" abre el
// resto de los elegibles. La disponibilidad es solo una ayuda: si no se pudo
// consultar, todo queda habilitado y el backend valida igual al confirmar.
function ModalConfirmarViaje({ viaje, onCerrar, onExito }) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [chofer, setChofer] = useState(SELECCION_VACIA);
  const [vehiculo, setVehiculo] = useState(SELECCION_VACIA);
  const [form, setForm] = useState(FORM_VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const viajeId = viaje?.id;

  useEffect(() => {
    if (!viajeId) return;
    let vigente = true;

    api.get('/usuarios/disponibles-chofer').then(({ data }) => vigente && setChoferes(data.usuarios));
    api.get('/vehiculos').then(({ data }) => vigente && setVehiculos(ordenarPorInterno(data.vehiculos)));
    disponibilidadDeViaje(viajeId, { todos: true })
      .then(({ data }) => {
        if (vigente) setDisponibilidad({ choferes: porId(data.choferes), vehiculos: porId(data.vehiculos) });
      })
      // Es solo una ayuda: sin ella se puede confirmar igual.
      .catch(() => {});

    return () => {
      vigente = false;
      setDisponibilidad(null);
    };
  }, [viajeId]);

  useEffect(() => {
    if (!viaje) return;
    setForm({
      fechaInicio: aInputCordoba(viaje.fechaInicio),
      fechaFin: aInputCordoba(viaje.fechaFin),
      kilometrosEstimados: viaje.kilometrosEstimados ?? '',
    });
    setChofer(seleccionInicial(viaje.choferesCandidatos ?? []));
    setVehiculo(seleccionInicial(viaje.vehiculosCandidatos ?? []));
    setErrores({});
  }, [viaje]);

  if (!viaje) return null;

  const candidatosChofer = (viaje.choferesCandidatos ?? []).map((c) => ({ id: c.id, etiqueta: nombreChofer(c) }));
  const candidatosVehiculo = (viaje.vehiculosCandidatos ?? []).map((c) => ({ id: c.id, etiqueta: nombreVehiculo(c) }));

  // El select de "otro" ofrece a todos los elegibles menos a los que ya están
  // arriba como candidatos.
  const otrosChoferes = choferes
    .filter((c) => !candidatosChofer.some((cand) => cand.id === c.id))
    .map((c) => ({ id: c.id, etiqueta: nombreChofer(c) }));
  const otrosVehiculos = vehiculos
    .filter((v) => !candidatosVehiculo.some((cand) => cand.id === v.id))
    .map((v) => ({ id: v.id, etiqueta: nombreVehiculo(v) }));

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function confirmar() {
    setErrores({});
    setEnviando(true);
    try {
      const { data } = await confirmarViaje(viaje.id, {
        ...form,
        choferId: idElegido(chofer),
        vehiculoId: idElegido(vehiculo),
      });
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
      size="wide"
      icon={ICONO_CONFIRMAR}
      title="Confirmar viaje"
      description={
        <>
          <SeleccionCandidato
            id="confirmar-choferId"
            etiqueta="Chofer"
            candidatos={candidatosChofer}
            otros={otrosChoferes}
            estados={disponibilidad?.choferes}
            valor={chofer}
            onChange={setChofer}
            error={errores.choferId}
          />

          <SeleccionCandidato
            id="confirmar-vehiculoId"
            etiqueta="Vehículo"
            candidatos={candidatosVehiculo}
            otros={otrosVehiculos}
            estados={disponibilidad?.vehiculos}
            valor={vehiculo}
            onChange={setVehiculo}
            error={errores.vehiculoId}
          />

          <FormField id="confirmar-fechaInicio" label="Fecha y hora de inicio" error={errores.fechaInicio} required>
            <input type="datetime-local" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
          </FormField>

          <FormField id="confirmar-fechaFin" label="Fecha y hora de fin" error={errores.fechaFin} required>
            <input type="datetime-local" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
          </FormField>

          <FormField
            id="confirmar-kilometrosEstimados"
            label="Kilómetros estimados"
            error={errores.kilometrosEstimados}
            required
          >
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
