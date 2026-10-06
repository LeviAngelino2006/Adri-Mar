import { useEffect, useState } from 'react';
import ConfirmModal from './ui/ConfirmModal';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import { comenzarViaje, finalizarViaje } from '../services/viajesApi';
import { nombreChofer, nombreVehiculo } from '../utils/viajeFormato';

const ICONO_COMENZAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
  </svg>
);

const ICONO_FINALIZAR = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const CONFIGS = {
  comenzar: {
    titulo: 'Comenzar el viaje',
    campo: 'odometroInicial',
    etiquetaCampo: 'Odómetro inicial (km)',
    icono: ICONO_COMENZAR,
    llamar: (id, valor) => comenzarViaje(id, valor),
    mensajeExito: 'Viaje comenzado correctamente.',
    textoBoton: 'Comenzar viaje',
    textoEnviando: 'Comenzando…',
  },
  finalizar: {
    titulo: 'Finalizar el viaje',
    campo: 'odometroFinal',
    etiquetaCampo: 'Odómetro final (km)',
    icono: ICONO_FINALIZAR,
    conObservacion: true,
    llamar: (id, valor, observacion) => finalizarViaje(id, valor, observacion),
    mensajeExito: 'Viaje finalizado correctamente. Se actualizó el kilometraje del vehículo.',
    textoBoton: 'Finalizar viaje',
    textoEnviando: 'Finalizando…',
  },
};

// Mismo máximo que valida el backend (MAX_LONGITUD_OBSERVACION en
// viajeService). Acá solo alimenta el contador: el que rechaza es el backend.
const MAX_LONGITUD_OBSERVACION = 1000;

// Comenzar y Finalizar piden exactamente lo mismo (un odómetro, con el
// kilometraje actual del vehículo como referencia) y solo cambian el
// endpoint, el campo y los textos — un solo componente parametrizado por
// `accion` en vez de duplicar el modal.
function ModalOdometroViaje({ viaje, accion, onCerrar, onExito }) {
  const config = accion ? CONFIGS[accion] : null;
  const [valor, setValor] = useState('');
  const [observacion, setObservacion] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setValor('');
    setObservacion('');
    setErrores({});
  }, [viaje?.id, accion]);

  if (!viaje || !config) return null;

  const cantidadObservacion = [...observacion].length;

  async function confirmar() {
    setErrores({});
    setEnviando(true);
    try {
      const { data } = await config.llamar(viaje.id, valor, observacion);
      onExito(data.viaje, config.mensajeExito);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 409 || err.response?.status === 403) {
        setErrores({ general: err.response.data.error });
      } else {
        setErrores({ general: 'No se pudo completar la acción' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmModal
      open={Boolean(viaje)}
      tone="brand"
      icon={config.icono}
      title={config.titulo}
      description={
        <div className="odometro-viaje-modal">
          <p>
            Chofer <strong>{nombreChofer(viaje.chofer)}</strong>, vehículo{' '}
            <strong>{nombreVehiculo(viaje.vehiculo)}</strong>.
            <br />
            Kilometraje actual del vehículo: <strong>{viaje.vehiculo.kilometraje} km</strong>.
          </p>
          <FormField id={config.campo} label={config.etiquetaCampo} error={errores[config.campo]}>
            <input
              type="number"
              min={viaje.vehiculo.kilometraje}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </FormField>
          {config.conObservacion && (
            <FormField
              id="observacion"
              label={
                <>
                  Observación{' '}
                  <span className={cantidadObservacion > MAX_LONGITUD_OBSERVACION ? 'contador-texto contador-texto-excedido' : 'contador-texto'}>
                    {cantidadObservacion}/{MAX_LONGITUD_OBSERVACION}
                  </span>
                </>
              }
              error={errores.observacion}
            >
              <textarea
                rows={3}
                placeholder="Opcional — algo para destacar del viaje"
                value={observacion}
                onChange={(e) => {
                  setObservacion(e.target.value);
                  setErrores((previos) => ({ ...previos, observacion: undefined }));
                }}
              />
            </FormField>
          )}
          {errores.general && <Alert variant="error">{errores.general}</Alert>}
        </div>
      }
      confirmLabel={enviando ? config.textoEnviando : config.textoBoton}
      onConfirm={confirmar}
      onCancel={onCerrar}
    />
  );
}

export default ModalOdometroViaje;
