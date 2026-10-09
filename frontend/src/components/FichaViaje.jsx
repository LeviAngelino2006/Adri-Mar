import Card from './ui/Card';
import RutaViaje from './RutaViaje';
import BotonVerRecorrido from './BotonVerRecorrido';
import { formatearDiaYHora, formatearKm, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';

const NO_REGISTRADO = 'No registrado';

const hayValor = (valor) => valor !== null && valor !== undefined && valor !== '';

const fecha = (valor) => (valor ? formatearDiaYHora(valor) : null);
const km = (valor) => (hayValor(valor) ? `${formatearKm(valor)} km` : null);

// Candidatos de un viaje A confirmar como "Ana Pérez, Beto Gómez". Sin la clave
// (el perfil no los puede ver) → null; con la clave y lista vacía → "Sin cargar",
// para que se note que todavía no se eligieron.
function listaDeNombres(candidatos, nombre) {
  if (!Array.isArray(candidatos)) return null;
  return candidatos.length > 0 ? candidatos.map(nombre).join(', ') : 'Sin cargar';
}

function Item({ etiqueta, valor, clase }) {
  return (
    <div className={clase ? `detalle-item ${clase}` : 'detalle-item'}>
      <dt>{etiqueta}</dt>
      <dd>{hayValor(valor) ? valor : NO_REGISTRADO}</dd>
    </div>
  );
}

// Dos datos que van juntos en la misma fila desde 640px. Un lado en null deja
// el hueco vacío, para que el par siguiente no se corra de columna.
function Par({ izquierda, derecha }) {
  return (
    <>
      {izquierda ? <Item {...izquierda} /> : <div className="detalle-hueco" aria-hidden="true" />}
      {derecha ? <Item {...derecha} /> : <div className="detalle-hueco" aria-hidden="true" />}
    </>
  );
}

// Ficha de un viaje: una sola Card con una grilla plana de pares, en el mismo
// orden que el formulario. Los botones de acción los arma cada página, debajo
// de esta Card.
function FichaViaje({ viaje }) {
  const vehiculo = viaje.vehiculo
    ? `${nombreVehiculo(viaje.vehiculo)} (${viaje.vehiculo.marca} ${viaje.vehiculo.modelo})`
    : null;

  // Recorrido real, solo si el viaje ya empezó (hay algún dato). Un viaje En
  // viaje muestra solo lo que ya existe (todavía no hay fin ni odómetro final),
  // con el hueco al lado; uno Finalizado, todo, con "No registrado" en lo que falte.
  const real = {
    inicio: { etiqueta: 'Hora real de inicio', valor: fecha(viaje.horaInicioReal) },
    fin: { etiqueta: 'Hora real de fin', valor: fecha(viaje.horaFinReal) },
    odometroInicial: { etiqueta: 'Odómetro inicial', valor: km(viaje.odometroInicial) },
    odometroFinal: { etiqueta: 'Odómetro final', valor: km(viaje.odometroFinal) },
    kmRealizados: { etiqueta: 'Km realizados', valor: km(viaje.kmRealizados) },
  };
  const empezo = Object.values(real).some((item) => hayValor(item.valor));
  const soloLoQueExiste = viaje.estado === 'EN_VIAJE';
  const dato = (item) => (soloLoQueExiste && !hayValor(item.valor) ? null : item);
  const paresReales = [
    [dato(real.inicio), dato(real.fin)],
    [dato(real.odometroInicial), dato(real.odometroFinal)],
    [dato(real.kmRealizados), null],
  ].filter(([izquierda, derecha]) => izquierda || derecha);

  return (
    <Card className="detalle-card viajes-detalle" role="region" aria-label="Ficha del viaje">
      <dl className="detalle-grid">
        <Item etiqueta="Cliente" valor={viaje.cliente?.nombre} clase="detalle-item-ancho detalle-item-destacado" />
        {/* Recorrido completo (origen, paradas, destino) con el botón al lado.
            Siempre se muestra: un viaje histórico sin origen o destino los dice
            "No registrado". */}
        <div className="detalle-item detalle-item-ancho">
          <dt>Recorrido</dt>
          <dd>
            <span className="detalle-recorrido">
              <RutaViaje origen={viaje.origen} destino={viaje.destino} paradas={viaje.paradas} variante="completa" />
              <BotonVerRecorrido
                origen={viaje.origen}
                paradas={(viaje.paradas ?? []).map((parada) => parada.ubicacion)}
                destino={viaje.destino}
              />
            </span>
          </dd>
        </div>
        <Par
          izquierda={{ etiqueta: 'Inicio', valor: fecha(viaje.fechaInicio) }}
          derecha={{ etiqueta: 'Fin', valor: fecha(viaje.fechaFin) }}
        />
        {viaje.estado === 'A_CONFIRMAR' ? (
          <>
            {/* Un A confirmar no tiene chofer ni vehículo asignado: tiene
                candidatos. Solo los ven los gestores (para el resto las claves
                no vienen y el ítem queda en "No registrado"). */}
            <Item
              etiqueta="Choferes posibles"
              valor={listaDeNombres(viaje.choferesCandidatos, nombreChofer)}
              clase="detalle-item-ancho"
            />
            <Item
              etiqueta="Vehículos posibles"
              valor={listaDeNombres(viaje.vehiculosCandidatos, nombreVehiculo)}
              clase="detalle-item-ancho"
            />
          </>
        ) : (
          <Par
            izquierda={{ etiqueta: 'Chofer', valor: viaje.chofer ? nombreChofer(viaje.chofer) : null }}
            derecha={{ etiqueta: 'Vehículo', valor: vehiculo }}
          />
        )}
        <Par
          izquierda={{ etiqueta: 'Kilómetros estimados', valor: km(viaje.kilometrosEstimados) }}
          derecha={{ etiqueta: 'Cantidad de pasajeros', valor: viaje.cantidadPasajeros }}
        />
        {empezo &&
          paresReales.map(([izquierda, derecha]) => (
            <Par key={(izquierda ?? derecha).etiqueta} izquierda={izquierda} derecha={derecha} />
          ))}
        {viaje.observacionFinal?.trim() && (
          <Item etiqueta="Observación" valor={viaje.observacionFinal} clase="detalle-item-ancho" />
        )}
      </dl>
    </Card>
  );
}

export default FichaViaje;
