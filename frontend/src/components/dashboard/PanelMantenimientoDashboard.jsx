import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import EstadoCarga from '../ui/EstadoCarga';
import EstadoBadge from '../ui/EstadoBadge';
import { ESTADOS_SERVICE } from '../../constants/mantenimiento';
import { detalleEstadoService, textoAlertas } from '../../utils/mantenimiento';

const MAX_MANTENIMIENTO_INICIAL = 5;

// Alertas de mantenimiento preventivo (vehículos con service Vencido o Próximo).
// Toma los datos que ya trajo GET /dashboard/indicadores para no duplicar pedidos.
function PanelMantenimientoDashboard({ carga }) {
  const navigate = useNavigate();
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const alertas = carga.cargando || carga.error ? [] : (carga.datos?.mantenimiento?.alertas ?? []);
  const resumen = textoAlertas(alertas);
  const visibles = mostrarTodos ? alertas : alertas.slice(0, MAX_MANTENIMIENTO_INICIAL);
  const restantes = alertas.length - MAX_MANTENIMIENTO_INICIAL;

  return (
    <Card className="dashboard-panel" role="region" aria-label="Mantenimiento">
      <div className="dashboard-panel-header">
        <h2>Mantenimiento</h2>
        {!carga.cargando && !carga.error && resumen && <span className="dashboard-resumen">{resumen}</span>}
      </div>

      <EstadoCarga
        carga={carga}
        forma="filas"
        cantidad={3}
        que="las alertas de mantenimiento"
        vacio={
          alertas.length === 0 && (
            <div className="dashboard-empty">
              <span>Flota al día</span>
              <span className="dashboard-empty-hint">
                Ningún vehículo tiene el service vencido ni próximo
              </span>
            </div>
          )
        }
      >
        <>
          <ul className="dashboard-lista">
            {visibles.map((item) => {
              const estado = ESTADOS_SERVICE[item.estado] ?? ESTADOS_SERVICE.PROXIMO;
              return (
                <li key={item.vehiculo.id}>
                  <button
                    type="button"
                    className="dashboard-fila sin-hora"
                    onClick={() => navigate(`/mantenimiento?vehiculoId=${item.vehiculo.id}`)}
                  >
                    <span className="dashboard-fila-info">
                      <span className="dashboard-fila-titulo">
                        {item.vehiculo.numeroInterno} - <span className="patente">{item.vehiculo.dominio}</span>
                      </span>
                      <span className="dashboard-fila-meta">{detalleEstadoService(item)}</span>
                    </span>
                    <EstadoBadge tono={estado.tono} size="sm">
                      {estado.label}
                    </EstadoBadge>
                  </button>
                </li>
              );
            })}
          </ul>

          {restantes > 0 && (
            <Button variant="secondary" className="dashboard-ver-mas" onClick={() => setMostrarTodos((m) => !m)}>
              {mostrarTodos ? 'Ver menos' : `Ver ${restantes} más`}
            </Button>
          )}
        </>
      </EstadoCarga>
    </Card>
  );
}

export default PanelMantenimientoDashboard;
