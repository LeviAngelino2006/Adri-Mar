import { useEffect, useState } from 'react';
import api from '../services/api';
import Card from './ui/Card';
import Button from './ui/Button';
import EstadoCarga from './ui/EstadoCarga';
import Toast from './ui/Toast';
import RutaViaje from './RutaViaje';
import ModalConfirmarViaje from './ModalConfirmarViaje';
import AvisarPorWhatsApp from './AvisarPorWhatsApp';
import { DURACION_TOAST_CON_ACCION_MS, DURACION_TOAST_MS } from '../constants/toast';
import { agruparPorConfirmar, rangoHoyYManana } from '../utils/viajesPorConfirmar';
import { formatearHora } from '../utils/viajeFormato';
import { avisoWhatsApp } from '../utils/whatsapp';
import { useCarga } from '../hooks/useCarga';
import './PanelViajesPorConfirmar.css';

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
// datos ya agrupados. Cada estado es excluyente: cargando, error (con
// "Reintentar", ver EstadoCarga), vacío o con viajes (un grupo vacío no se
// muestra). `carga` es lo que devuelve useCarga.
export function ContenidoPorConfirmar({ carga, hoy, manana, onConfirmar }) {
  return (
    <EstadoCarga
      carga={carga}
      forma="filas"
      que="los viajes por confirmar"
      vacio={hoy.length + manana.length === 0 && <div className="dashboard-empty">Nada pendiente para hoy ni mañana</div>}
    >
      <GrupoDia titulo="Hoy" viajes={hoy} onConfirmar={onConfirmar} />
      <GrupoDia titulo="Mañana" viajes={manana} onConfirmar={onConfirmar} />
    </EstadoCarga>
  );
}

// Fuera del componente para que useCarga reciba siempre la misma función; el
// rango de hoy y mañana se calcula en cada pedido.
function pedirPorConfirmar() {
  return api
    .get('/viajes', { params: { estado: 'A_CONFIRMAR', ...rangoHoyYManana() } })
    .then(({ data }) => data.viajes);
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
  const carga = useCarga(pedirPorConfirmar);
  const viajes = carga.datos ?? [];
  const [pedidoConfirmar, setPedidoConfirmar] = useState(null);
  // { texto, viaje } mientras el toast de éxito está en pantalla.
  const [aviso, setAviso] = useState(null);

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
    carga.recargar();
  }

  const { hoy, manana } = agruparPorConfirmar(viajes);

  return (
    <>
      <Card className="dashboard-panel por-confirmar" role="region" aria-label="Viajes por confirmar">
        <h2>Viajes por confirmar</h2>

        <ContenidoPorConfirmar
          carga={carga}
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
