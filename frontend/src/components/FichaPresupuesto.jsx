import Card from './ui/Card';
import { aCentavos } from '../utils/importes';
import { ACLARACION_IVA, textoPrecioConIva } from '../utils/ivaPresupuesto';
import { formatearPesos } from '../utils/moneda';
import { formatearFechaCorta } from '../utils/viajeFormato';
import { fechaVencimiento, formatearFechaPresupuesto, textoHorario } from '../utils/presupuestos';

function Item({ etiqueta, children, clase }) {
  return (
    <div className={clase ? `detalle-item ${clase}` : 'detalle-item'}>
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const Hueco = () => <div className="detalle-hueco" aria-hidden="true" />;

// Ficha de un presupuesto: una sola Card con la grilla de pares, en el mismo
// orden que el formulario (ver FichaDetalle en el design system). Todo sale
// del objeto de GET /presupuestos/:id, igual que el PDF. Las acciones las pasa
// la página (`acciones`) y van dentro de la Card, debajo de la grilla.
function FichaPresupuesto({ presupuesto, acciones }) {
  const importe = aCentavos(presupuesto.importeNeto);
  const vence = fechaVencimiento(presupuesto.fechaEmision, presupuesto.diasValidez);
  const dias = presupuesto.diasValidez === 1 ? 'día' : 'días';

  return (
    <Card className="detalle-card presupuestos-detalle" role="region" aria-label="Ficha del presupuesto">
      <dl className="detalle-grid">
        <Item etiqueta="Fecha de emisión">{formatearFechaPresupuesto(presupuesto.fechaEmision)}</Item>
        <Item etiqueta="Validez">
          {presupuesto.diasValidez} {dias} · vence el {formatearFechaPresupuesto(vence)}
        </Item>

        <Item etiqueta="Cliente" clase="detalle-item-ancho detalle-item-destacado">
          {presupuesto.cliente.nombre}
        </Item>

        <Item etiqueta="Origen">{presupuesto.origen.nombre}</Item>
        <Item etiqueta="Destino">{presupuesto.destino.nombre}</Item>

        <Item etiqueta="Fecha del servicio">{formatearFechaPresupuesto(presupuesto.fechaServicio)}</Item>
        <Item etiqueta="Horario de salida">
          <span className="num">{textoHorario(presupuesto.horaSalida)}</span>
        </Item>

        <Item etiqueta="Cantidad de pasajeros">{presupuesto.cantidadPasajeros}</Item>
        <Hueco />

        <Item etiqueta={presupuesto.unidades.length === 1 ? 'Unidad' : 'Unidades'} clase="detalle-item-ancho">
          <ul className="presupuestos-unidades">
            {presupuesto.unidades.map((unidad) => (
              <li key={unidad.id}>
                {unidad.descripcion}
                <span className="presupuestos-unidad-vehiculo">
                  {' '}
                  · {unidad.vehiculo.numeroInterno} - <span className="patente">{unidad.vehiculo.dominio}</span>
                </span>
              </li>
            ))}
          </ul>
        </Item>

        <Item etiqueta="Importe" clase="detalle-item-destacado">
          {formatearPesos(importe)}
          <div className="presupuesto-iva">
            <p>{ACLARACION_IVA}</p>
            <p>{textoPrecioConIva(importe)}</p>
          </div>
        </Item>
        <Hueco />

        <Item etiqueta="Forma de pago" clase="detalle-item-ancho">
          {presupuesto.formaPago}
        </Item>

        <Item etiqueta="Creado por">{presupuesto.creadoPor.nombre} {presupuesto.creadoPor.apellido}</Item>
        <Item etiqueta="Registrado el">{formatearFechaCorta(presupuesto.creadoEn)}</Item>
      </dl>

      {acciones && <div className="detalle-acciones">{acciones}</div>}
    </Card>
  );
}

export default FichaPresupuesto;
