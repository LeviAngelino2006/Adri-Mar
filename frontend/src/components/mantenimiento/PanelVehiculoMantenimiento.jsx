import { useState } from 'react';
import Button from '../ui/Button';
import EstadoBadge from '../ui/EstadoBadge';
import PanelLateral from '../ui/PanelLateral';
import { ESTADOS_SERVICE } from '../../constants/mantenimiento';
import { detalleEstadoService, textoIntervalo } from '../../utils/mantenimiento';
import FormularioArreglo from './FormularioArreglo';
import FormularioAsignarPlan from './FormularioAsignarPlan';
import FormularioService from './FormularioService';
import HistorialVehiculo from './HistorialVehiculo';
import { BarraService } from './ListaService';

const TITULOS = {
  service: 'Registrar service',
  arreglo: 'Registrar arreglo',
  plan: 'Asignar plan de service',
};

function Patente({ vehiculo }) {
  return (
    <>
      {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span>
    </>
  );
}

// Resumen del vehículo arriba del panel: estado del service y la barra.
function EstadoVehiculo({ item }) {
  const estado = ESTADOS_SERVICE[item.estado];
  return (
    <div className="mantenimiento-panel-estado">
      <div className="mantenimiento-panel-estado-top">
        <EstadoBadge tono={estado.tono} size="sm">
          {estado.label}
        </EstadoBadge>
        <span className="mantenimiento-panel-intervalo">{textoIntervalo(item)}</span>
      </div>
      <p className="mantenimiento-panel-texto">{detalleEstadoService(item)}</p>
      {item.estado !== 'SIN_PLAN' && <BarraService porcentajeConsumido={item.porcentajeConsumido} />}
    </div>
  );
}

// Panel de Mantenimiento de un vehículo (se abre al tocar su tarjeta). Primero
// se ve el vehículo y después se elige qué hacer:
//  - resumen: el estado del service, las acciones y el historial del vehículo;
//  - service / arreglo / plan: el formulario, dentro del mismo panel, con
//    "← Volver" al resumen.
// Al guardar vuelve al resumen con el historial recargado y el registro nuevo
// expandido. `onGuardado(mensaje)` avisa a la página (toast y recargar la lista).
function PanelVehiculoMantenimiento({ item, onClose, onGuardado }) {
  const { vehiculo } = item;
  const [vista, setVista] = useState('resumen');
  // Cada guardado vuelve a montar el historial (lo pide de nuevo).
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [registroNuevo, setRegistroNuevo] = useState(null);

  const volverAlResumen = () => setVista('resumen');

  function guardado(mensaje, registro = null) {
    setRegistroNuevo(registro?.id ?? null);
    setVersionHistorial((n) => n + 1);
    setVista('resumen');
    onGuardado(mensaje);
  }

  const enResumen = vista === 'resumen';
  const subtitulo = enResumen ? (
    `${vehiculo.marca} ${vehiculo.modelo}`
  ) : (
    <>
      <Patente vehiculo={vehiculo} /> · {vehiculo.marca} {vehiculo.modelo}
    </>
  );

  return (
    <PanelLateral
      titulo={enResumen ? <Patente vehiculo={vehiculo} /> : TITULOS[vista]}
      subtitulo={subtitulo}
      onClose={onClose}
      onVolver={enResumen ? undefined : volverAlResumen}
      vista={vista}
      centrado
    >
      {enResumen && (
        <div className="mantenimiento-panel-resumen">
          <EstadoVehiculo item={item} />

          <div className="mantenimiento-panel-acciones">
            {item.estado === 'SIN_PLAN' ? (
              <Button variant="primary" onClick={() => setVista('plan')}>
                Asignar plan de service
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setVista('service')}>
                Registrar service
              </Button>
            )}
            <Button variant="secondary" onClick={() => setVista('arreglo')}>
              Registrar arreglo
            </Button>
          </div>

          <HistorialVehiculo key={versionHistorial} vehiculoId={vehiculo.id} abiertoInicial={registroNuevo} />
        </div>
      )}

      {vista === 'service' && (
        <FormularioService item={item} onCancel={volverAlResumen} onSuccess={(registro) => guardado('Service registrado.', registro)} />
      )}

      {vista === 'arreglo' && (
        <FormularioArreglo
          vehiculo={vehiculo}
          onCancel={volverAlResumen}
          onSuccess={(registro) => guardado('Arreglo registrado.', registro)}
        />
      )}

      {vista === 'plan' && (
        <FormularioAsignarPlan item={item} onCancel={volverAlResumen} onSuccess={() => guardado('Plan de service asignado.')} />
      )}
    </PanelLateral>
  );
}

export default PanelVehiculoMantenimiento;
