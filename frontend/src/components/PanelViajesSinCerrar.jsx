import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Button from './ui/Button';
import Card from './ui/Card';
import EstadoBadge from './ui/EstadoBadge';
import EstadoCarga from './ui/EstadoCarga';
import RutaViaje from './RutaViaje';
import { ESTADOS_VIAJE } from '../constants/estadosViaje';
import { useCarga } from '../hooks/useCarga';
import {
  MAX_SIN_CERRAR,
  consultaSinCerrar,
  fechaFilaSinCerrar,
  textoCantidadSinCerrar,
  viajesSinCerrar,
} from '../utils/viajesSinCerrar';
import { destinoFichaViaje } from '../utils/vistasViajes';

// Lo que muestra el panel según su estado, sin lógica de carga ni de
// navegación: cargando, error (con "Reintentar", ver EstadoCarga) o las filas.
// `viajes` son los sin cerrar, ya ordenados. Cada fila es la ruta, la fecha y el
// estado, sin color ni badge para el atraso; se muestran MAX_SIN_CERRAR y, si
// hay más, "Ver todos".
export function ContenidoSinCerrar({ carga, viajes, ahora, onAbrir, onVerTodos }) {
  return (
    <EstadoCarga carga={carga} forma="filas" cantidad={2} que="los viajes sin cerrar">
      <ul className="dashboard-lista">
        {viajes.slice(0, MAX_SIN_CERRAR).map((viaje) => {
          const estado = ESTADOS_VIAJE[viaje.estado];
          return (
            <li key={viaje.id}>
              <button type="button" className="dashboard-fila sin-hora" onClick={() => onAbrir(viaje)}>
                <span className="dashboard-fila-info">
                  <span className="dashboard-fila-titulo">
                    <RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} />
                  </span>
                  <span className="dashboard-fila-meta">{fechaFilaSinCerrar(viaje, ahora)}</span>
                </span>
                <EstadoBadge tono={estado.tono} size="sm">
                  {estado.label}
                </EstadoBadge>
              </button>
            </li>
          );
        })}
      </ul>

      {viajes.length > MAX_SIN_CERRAR && (
        <Button variant="secondary" className="dashboard-ver-mas" onClick={onVerTodos}>
          Ver todos
        </Button>
      )}
    </EstadoCarga>
  );
}

// Fuera del componente para que useCarga reciba siempre la misma función; el día
// se calcula en cada pedido.
function pedirSinCerrar() {
  return api.get('/viajes', { params: consultaSinCerrar() }).then(({ data }) => viajesSinCerrar(data.viajes));
}

// Panel del Dashboard de Administrador y Encargado, en la columna derecha, arriba
// de Documentación: los viajes de días anteriores que siguen abiertos, del más
// viejo al más nuevo. Lo que es "sin cerrar" lo decide el backend (ver
// utils/viajesSinCerrar). Aparece solo si hay alguno: mientras carga o si falló
// se ve (con Cargando o el error y "Reintentar"); cargado y sin ninguno, no.
// Cada fila abre la ficha del viaje; "Ver todos" lleva a Viajes (Próximos), que
// los muestra arriba de todo, en su grupo "Sin cerrar".
function PanelViajesSinCerrar() {
  const navigate = useNavigate();
  const carga = useCarga(pedirSinCerrar);
  const viajes = carga.datos ?? [];
  const [ahora] = useState(() => Date.now());

  if (!carga.cargando && !carga.error && viajes.length === 0) return null;

  return (
    <Card className="dashboard-panel" role="region" aria-label="Sin cerrar">
      <div className="dashboard-panel-header">
        <h2>Sin cerrar</h2>
        {!carga.cargando && !carga.error && <span className="dashboard-resumen">{textoCantidadSinCerrar(viajes.length)}</span>}
      </div>
      <ContenidoSinCerrar
        carga={carga}
        viajes={viajes}
        ahora={ahora}
        onAbrir={(viaje) => navigate(...destinoFichaViaje(viaje))}
        onVerTodos={() => navigate('/viajes')}
      />
    </Card>
  );
}

export default PanelViajesSinCerrar;
