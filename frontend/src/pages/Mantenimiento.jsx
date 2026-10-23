import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Toast from '../components/ui/Toast';
import { ListadoHeader } from '../components/Listado';
import ModalAsignarPlan from '../components/mantenimiento/ModalAsignarPlan';
import ModalRegistrarService from '../components/mantenimiento/ModalRegistrarService';
import PestanaArreglos from '../components/mantenimiento/PestanaArreglos';
import PestanaHistorial from '../components/mantenimiento/PestanaHistorial';
import PestanaService from '../components/mantenimiento/PestanaService';
import { useCarga } from '../hooks/useCarga';
import { listarEstadoService } from '../services/mantenimientoApi';
import { VISTAS_MANTENIMIENTO } from '../constants/mantenimiento';
import { DURACION_TOAST_CON_ACCION_MS, DURACION_TOAST_MS } from '../constants/toast';
import { contarAlertas } from '../utils/mantenimiento';
import { ordenarPorInterno } from '../utils/vehiculos';
import './Mantenimiento.css';

const VISTAS_VALIDAS = VISTAS_MANTENIMIENTO.map((v) => v.valor);

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

// Mantenimiento: tres vistas hermanas con ControlSegmentado en la barra.
//  - Service: estado del service de cada vehículo y registrar un service.
//  - Arreglos: el formulario para registrar un trabajo que no es el service.
//  - Historial: services y arreglos de toda la flota.
// La vista y el vehículo del historial viven en la URL (?tab=historial&vehiculoId=7):
// se pueden compartir y funciona el botón Atrás.
function Mantenimiento() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const vista = VISTAS_VALIDAS.includes(tab) ? tab : 'service';
  const vehiculoHistorial = vista === 'historial' ? idDeUrl(searchParams.get('vehiculoId')) : null;

  // El estado del service de la flota: lo usan Service, la lista de vehículos de
  // los formularios y el contador de alertas.
  const cargaService = useCarga(useCallback(() => listarEstadoService().then(({ data }) => data.vehiculos), []));
  const itemsService = useMemo(() => cargaService.datos ?? [], [cargaService.datos]);
  const tiposVehiculo = useMemo(() => tiposDeLaFlota(itemsService), [itemsService]);
  const vehiculosOrdenados = useMemo(() => {
    const orden = new Map(ordenarPorInterno(itemsService.map((i) => i.vehiculo)).map((v, indice) => [v.id, indice]));
    return [...itemsService].sort((a, b) => orden.get(a.vehiculo.id) - orden.get(b.vehiculo.id));
  }, [itemsService]);

  const [modalService, setModalService] = useState(null); // { item } (item null = elegir vehículo)
  const [modalPlan, setModalPlan] = useState(null); // item SIN_PLAN
  const [toast, setToast] = useState(null); // { mensaje, accion }

  // El Toast no se oculta solo: lo hace quien lo monta.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.accion ? DURACION_TOAST_CON_ACCION_MS : DURACION_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // Cambiar de vista reemplaza el contenido de abajo: la página vuelve arriba.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [vista]);

  function cambiarVista(nueva) {
    setSearchParams(nueva === 'service' ? {} : { tab: nueva });
  }

  const linkHistorial = (vehiculoId) => `?tab=historial&vehiculoId=${vehiculoId}`;

  function serviceRegistrado(registro) {
    setModalService(null);
    setToast({
      mensaje: 'Service registrado.',
      accion: (
        <Link to={linkHistorial(registro.vehiculo.id)} onClick={() => setToast(null)}>
          Ver en el historial
        </Link>
      ),
    });
    cargaService.recargar();
  }

  function planAsignado() {
    setModalPlan(null);
    setToast({ mensaje: 'Plan de service asignado.' });
    cargaService.recargar();
  }

  function arregloRegistrado(registro) {
    setToast({
      mensaje: 'Arreglo registrado.',
      accion: (
        <Link to={linkHistorial(registro.vehiculo.id)} onClick={() => setToast(null)}>
          Ver en el historial
        </Link>
      ),
    });
    // El odómetro pudo avanzar: la lista de vehículos (y su estado) se actualiza.
    cargaService.recargar();
  }

  // La cantidad de Service son las alertas (vencidos y próximos); no se muestra
  // mientras carga, si falló o si no hay ninguna.
  const alertas = cargaService.datos && !cargaService.error ? contarAlertas(itemsService) : 0;
  const vistas = {
    opciones: VISTAS_MANTENIMIENTO.map((opcion) => ({
      ...opcion,
      cantidad: opcion.valor === 'service' && alertas > 0 ? alertas : undefined,
    })),
    valor: vista,
    onChange: cambiarVista,
    ariaLabel: 'Vista de mantenimiento',
  };

  return (
    <Layout>
      <ListadoHeader titulo="Mantenimiento" />

      {vista === 'service' && (
        <PestanaService
          carga={cargaService}
          tiposVehiculo={tiposVehiculo}
          vistas={vistas}
          onRegistrar={(item) => setModalService({ item })}
          onAsignar={setModalPlan}
        />
      )}

      {vista === 'arreglos' && <PestanaArreglos cargaVehiculos={cargaService} vistas={vistas} onSuccess={arregloRegistrado} />}

      {vista === 'historial' && (
        <PestanaHistorial
          vehiculoId={vehiculoHistorial}
          onQuitarVehiculo={() => setSearchParams({ tab: 'historial' })}
          tiposVehiculo={tiposVehiculo}
          vistas={vistas}
        />
      )}

      {modalService && (
        <ModalRegistrarService
          vehiculos={vehiculosOrdenados}
          vehiculo={modalService.item}
          onClose={() => setModalService(null)}
          onSuccess={serviceRegistrado}
        />
      )}

      {modalPlan && <ModalAsignarPlan item={modalPlan} onClose={() => setModalPlan(null)} onSuccess={planAsignado} />}

      {toast && <Toast action={toast.accion}>{toast.mensaje}</Toast>}
    </Layout>
  );
}

export default Mantenimiento;
