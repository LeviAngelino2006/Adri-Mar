import Card from './ui/Card';
import { formatearDiaYHora, formatearKm, nombreChofer, nombreVehiculo } from '../utils/viajeFormato';

const NO_REGISTRADO = 'No registrado';

const hayValor = (valor) => valor !== null && valor !== undefined && valor !== '';

const fecha = (valor) => (valor ? formatearDiaYHora(valor) : null);
const km = (valor) => (hayValor(valor) ? `${formatearKm(valor)} km` : null);

// Un bloque titulado de la ficha. Sin ningún dato no se renderiza; un dato
// sin valor dentro de un bloque que sí tiene otros se muestra "No registrado".
function Seccion({ titulo, items }) {
  if (!items.some((item) => hayValor(item.valor))) return null;

  return (
    <section className="detalle-seccion">
      <h2 className="detalle-seccion-titulo">{titulo}</h2>
      <dl className="detalle-grid">
        {items.map(({ etiqueta, valor, clase }) => (
          <div key={etiqueta} className={clase ? `detalle-item ${clase}` : 'detalle-item'}>
            <dt>{etiqueta}</dt>
            <dd>{hayValor(valor) ? valor : NO_REGISTRADO}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Ficha de un viaje agrupada en secciones dentro de una sola Card, con los
// mismos pares de campos que el formulario: Viaje, Programación, Asignación,
// Recorrido real y Observación. Los botones de acción los arma cada página,
// debajo de esta Card.
function FichaViaje({ viaje }) {
  const vehiculo = viaje.vehiculo
    ? `${nombreVehiculo(viaje.vehiculo)} (${viaje.vehiculo.marca} ${viaje.vehiculo.modelo})`
    : null;

  const recorridoReal = [
    { etiqueta: 'Hora real de inicio', valor: fecha(viaje.horaInicioReal) },
    { etiqueta: 'Hora real de fin', valor: fecha(viaje.horaFinReal) },
    { etiqueta: 'Odómetro inicial', valor: km(viaje.odometroInicial) },
    { etiqueta: 'Odómetro final', valor: km(viaje.odometroFinal) },
    { etiqueta: 'Km realizados', valor: km(viaje.kmRealizados) },
  ];

  return (
    <Card className="detalle-card viajes-detalle" role="region" aria-label="Ficha del viaje">
      <Seccion
        titulo="Viaje"
        items={[
          { etiqueta: 'Cliente', valor: viaje.cliente?.nombre, clase: 'detalle-item-ancho detalle-item-destacado' },
          { etiqueta: 'Origen', valor: viaje.origen?.nombre },
          { etiqueta: 'Destino', valor: viaje.destino?.nombre },
        ]}
      />
      <Seccion
        titulo="Programación"
        items={[
          { etiqueta: 'Inicio', valor: fecha(viaje.fechaInicio) },
          { etiqueta: 'Fin', valor: fecha(viaje.fechaFin) },
        ]}
      />
      <Seccion
        titulo="Asignación"
        items={[
          { etiqueta: 'Chofer', valor: viaje.chofer ? nombreChofer(viaje.chofer) : null },
          { etiqueta: 'Vehículo', valor: vehiculo },
          { etiqueta: 'Kilómetros estimados', valor: km(viaje.kilometrosEstimados) },
        ]}
      />
      {/* Un viaje En viaje muestra solo lo que ya existe (todavía no hay fin ni
          odómetro final); uno Finalizado, todo, con "No registrado" en lo que falte. */}
      <Seccion
        titulo="Recorrido real"
        items={viaje.estado === 'EN_VIAJE' ? recorridoReal.filter((item) => hayValor(item.valor)) : recorridoReal}
      />
      <Seccion
        titulo="Observación"
        items={[
          {
            etiqueta: 'Observación del viaje',
            valor: viaje.observacionFinal?.trim() ? viaje.observacionFinal : null,
            clase: 'detalle-item-ancho',
          },
        ]}
      />
    </Card>
  );
}

export default FichaViaje;
