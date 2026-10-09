import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import Card from './ui/Card';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import Alert from './ui/Alert';
import Toast from './ui/Toast';
import RutaViaje from './RutaViaje';
import ModalConfirmarViaje from './ModalConfirmarViaje';
import AvisarPorWhatsApp from './AvisarPorWhatsApp';
import { DURACION_TOAST_CON_ACCION_MS, DURACION_TOAST_MS } from '../constants/toast';
import { agruparPorConfirmar, rangoHoyYManana } from '../utils/viajesPorConfirmar';
import { formatearHora } from '../utils/viajeFormato';
import { avisoWhatsApp } from '../utils/whatsapp';
import './PanelViajesPorConfirmar.css';

const ICONO_CALENDARIO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

function GrupoDia({ titulo, viajes, onConfirmar }) {
  if (viajes.length === 0) return null;

  return (
    <section aria-label={titulo}>
      <h3 className="dashboard-grupo-dia">{titulo}</h3>
      <ul className="dashboard-lista">
        {viajes.map((viaje) => (
          <li key={viaje.id}>
            <div className="por-confirmar-fila">
              <span className="hora-col">{formatearHora(viaje.fechaInicio)}</span>
              <span className="dashboard-fila-info">
                <span className="dashboard-fila-titulo">
                  <RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} />
                </span>
                {viaje.cliente && <span className="dashboard-fila-meta">{viaje.cliente.nombre}</span>}
              </span>
              <Button variant="secondary" className="por-confirmar-accion" onClick={() => onConfirmar(viaje)}>
                Confirmar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lo que muestra el panel según su estado, sin lógica de carga: solo recibe los
// datos ya agrupados. Cada estado es excluyente: cargando, error, vacío o con
// viajes (un grupo vacío no se muestra).
export function ContenidoPorConfirmar({ cargando, error, hoy, manana, onConfirmar }) {
  if (cargando) {
    return (
      <div className="loading-state">
        <Spinner label="Cargando viajes por confirmar" />
        <span>Cargando…</span>
      </div>
    );
  }

  if (error) return <Alert variant="error">No se pudieron cargar los viajes por confirmar</Alert>;

  if (hoy.length + manana.length === 0) {
    return (
      <div className="por-confirmar-vacio">
        {ICONO_CALENDARIO}
        <span>Nada pendiente para hoy ni mañana</span>
      </div>
    );
  }

  return (
    <>
      <GrupoDia titulo="Hoy" viajes={hoy} onConfirmar={onConfirmar} />
      <GrupoDia titulo="Mañana" viajes={manana} onConfirmar={onConfirmar} />
    </>
  );
}

// Panel del Dashboard de Administrador/Encargado: los viajes A confirmar que hay
// que resolver HOY y MAÑANA (días de Córdoba), en dos grupos. Un grupo vacío no se
// muestra; si los dos están vacíos, "Nada pendiente para hoy ni mañana". Los
// atrasados de días anteriores no entran. Cada viaje lleva su botón "Confirmar",
// que abre el mismo modal de la pantalla de Viajes; al confirmar, un toast ofrece
// avisarle al chofer por WhatsApp.
//
// El filtro por día lo hace el backend (fechaDesde/fechaHasta, que ya interpreta
// las fechas sueltas como días de Córdoba), así no se descargan todos los viajes.
function PanelViajesPorConfirmar() {
  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [pedidoConfirmar, setPedidoConfirmar] = useState(null);
  // { texto, viaje } mientras el toast de éxito está en pantalla.
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(
    () =>
      api
        .get('/viajes', { params: { estado: 'A_CONFIRMAR', ...rangoHoyYManana() } })
        .then(({ data }) => {
          setViajes(data.viajes);
          setError(false);
        })
        .catch(() => setError(true))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeAvisar = Boolean(aviso && avisoWhatsApp(aviso.viaje).url);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(
      () => setAviso(null),
      puedeAvisar ? DURACION_TOAST_CON_ACCION_MS : DURACION_TOAST_MS
    );
    return () => clearTimeout(t);
  }, [aviso, puedeAvisar]);

  function manejarExitoConfirmar(viajeConfirmado) {
    setPedidoConfirmar(null);
    setAviso({ texto: 'Viaje confirmado correctamente. Quedó Programado.', viaje: viajeConfirmado });
    cargar();
  }

  const { hoy, manana } = agruparPorConfirmar(viajes);

  return (
    <>
      <Card className="dashboard-panel por-confirmar" role="region" aria-label="Viajes por confirmar">
        <h2>Viajes por confirmar</h2>

        <ContenidoPorConfirmar
          cargando={cargando}
          error={error}
          hoy={hoy}
          manana={manana}
          onConfirmar={setPedidoConfirmar}
        />
      </Card>

      {aviso && (
        <Toast action={puedeAvisar ? <AvisarPorWhatsApp viaje={aviso.viaje} variante="enlace" /> : undefined}>
          {aviso.texto}
        </Toast>
      )}

      <ModalConfirmarViaje
        viaje={pedidoConfirmar}
        onCerrar={() => setPedidoConfirmar(null)}
        onExito={manejarExitoConfirmar}
      />
    </>
  );
}

export default PanelViajesPorConfirmar;
