import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Toast from '../components/ui/Toast';
import { ListadoHeader } from '../components/Listado';
import ListaService from '../components/mantenimiento/ListaService';
import PanelVehiculoMantenimiento from '../components/mantenimiento/PanelVehiculoMantenimiento';
import { useCarga } from '../hooks/useCarga';
import { listarEstadoService } from '../services/mantenimientoApi';
import { DURACION_TOAST_MS } from '../constants/toast';
import './Mantenimiento.css';

// Id de la URL (?vehiculoId=) o null si falta o no es válido.
function idDeUrl(valor) {
  const id = Number.parseInt(valor, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Tipos de vehículo de la flota, para los filtros (sin pedirlos aparte).
function tiposDeLaFlota(items) {
  const porId = new Map(items.map(({ vehiculo }) => [vehiculo.tipoVehiculoId, vehiculo.tipoVehiculo]));
  return [...porId].map(([id, descripcion]) => ({ id, descripcion })).sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion), 'es'));
}

// Mantenimiento: la lista de vehículos con el estado de su service (aviso y
// barra de km). Primero se elige el vehículo y después qué hacer: al tocar su
// tarjeta se abre su panel lateral, con "Registrar service", "Registrar
// arreglo" (o "Asignar plan de service" si no tiene) y su historial.
// El panel abierto vive en la URL (?vehiculoId=7): se puede compartir y Atrás
// lo cierra. Los vehículos dados de baja no están en la lista ni abren panel.
function Mantenimiento() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const vehiculoAbierto = idDeUrl(searchParams.get('vehiculoId'));

  // El estado del service de la flota: lo usan la lista y el panel.
  const cargaService = useCarga(useCallback(() => listarEstadoService().then(({ data }) => data.vehiculos), []));
  const itemsService = useMemo(() => cargaService.datos ?? [], [cargaService.datos]);
  const tiposVehiculo = useMemo(() => tiposDeLaFlota(itemsService), [itemsService]);
  const itemAbierto = vehiculoAbierto ? itemsService.find((item) => item.vehiculo.id === vehiculoAbierto) : null;

  const [toast, setToast] = useState(null);

  // El Toast no se oculta solo: lo hace quien lo monta.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // Abrir suma una entrada al historial del navegador (Atrás cierra el panel).
  function abrirPanel(item) {
    setSearchParams({ vehiculoId: String(item.vehiculo.id) }, { state: { panelDesdeLista: true } });
  }

  // Si el panel se abrió desde la lista, cerrar es volver atrás (así Atrás no lo
  // reabre); si se entró directo con ?vehiculoId=, se quita el parámetro.
  const cerrarPanel = useCallback(() => {
    if (location.state?.panelDesdeLista) navigate(-1);
    else setSearchParams({}, { replace: true });
  }, [location.state, navigate, setSearchParams]);

  // Guardar algo puede cambiar el odómetro o el estado del service: la lista
  // (y el resumen del panel) se actualizan.
  function guardado(mensaje) {
    setToast(mensaje);
    cargaService.recargar();
  }

  return (
    <Layout>
      <ListadoHeader titulo="Mantenimiento" />

      <ListaService carga={cargaService} tiposVehiculo={tiposVehiculo} onAbrir={abrirPanel} />

      {itemAbierto && (
        <PanelVehiculoMantenimiento key={itemAbierto.vehiculo.id} item={itemAbierto} onClose={cerrarPanel} onGuardado={guardado} />
      )}

      {toast && <Toast>{toast}</Toast>}
    </Layout>
  );
}

export default Mantenimiento;
