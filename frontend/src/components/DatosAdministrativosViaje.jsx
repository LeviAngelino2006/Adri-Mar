import Card from './ui/Card';
import Button from './ui/Button';
import { capitalizarCatalogo, formatearFechaCorta, formatearMonto } from '../utils/viajeFormato';
import './DatosAdministrativosViaje.css';

const NO_CARGADO = 'No cargado';

function Dato({ etiqueta, ancho = false, children }) {
  return (
    <div className={ancho ? 'detalle-item detalle-item-ancho' : 'detalle-item'}>
      <dt>{etiqueta}</dt>
      <dd>{children ?? NO_CARGADO}</dd>
    </div>
  );
}

// Sección de la ficha de detalle con los datos administrativos/financieros
// del viaje, solo lectura. Es exclusiva de Administrador/Encargado — el que la
// renderiza (Viajes.jsx) es quien decide no montarla para el resto. Funciona
// en cualquier estado del viaje: el backend no restringe por estado.
// "Editar datos administrativos" llama a `onEditar(viaje)`: la edición es una
// pantalla aparte (FormDatosAdministrativos, SCRUM-248).
// `ref` llega a la Card (React 19 lo pasa como prop): Viajes.jsx lo usa para
// llevar la vista hasta esta tarjeta después de crear un viaje.
function DatosAdministrativosViaje({ viaje, onEditar, ref }) {
  return (
    <Card ref={ref} className="detalle-card datos-admin" role="region" aria-label="Datos administrativos">
      <div className="datos-admin-header">
        <h2>Datos administrativos</h2>
        <Button variant="secondary" onClick={() => onEditar(viaje)}>
          Editar datos administrativos
        </Button>
      </div>

      <section className="detalle-seccion">
        <h3 className="detalle-seccion-titulo">Cobro al cliente</h3>
        <dl className="detalle-grid">
          <Dato etiqueta="Precio" ancho>
            {viaje.precio != null ? formatearMonto(viaje.precio) : null}
          </Dato>
          <Dato etiqueta="Estado del pago">
            {viaje.estadoPagoCliente ? capitalizarCatalogo(viaje.estadoPagoCliente.descripcion) : null}
          </Dato>
          <Dato etiqueta="Fecha de pago">
            {viaje.fechaPagoCliente ? formatearFechaCorta(viaje.fechaPagoCliente) : null}
          </Dato>
          <Dato etiqueta="Método de pago" ancho>
            {viaje.metodoPagoCliente ? capitalizarCatalogo(viaje.metodoPagoCliente.descripcion) : null}
          </Dato>
        </dl>
      </section>

      <section className="detalle-seccion">
        <h3 className="detalle-seccion-titulo">Pago al chofer</h3>
        <dl className="detalle-grid">
          <Dato etiqueta="Monto" ancho>
            {viaje.pagoChofer != null ? formatearMonto(viaje.pagoChofer) : null}
          </Dato>
          <Dato etiqueta="Estado del pago">
            {viaje.estadoPagoChofer ? capitalizarCatalogo(viaje.estadoPagoChofer.descripcion) : null}
          </Dato>
          <Dato etiqueta="Fecha de pago">
            {viaje.fechaPagoChofer ? formatearFechaCorta(viaje.fechaPagoChofer) : null}
          </Dato>
          <Dato etiqueta="Método de pago" ancho>
            {viaje.metodoPagoChofer ? capitalizarCatalogo(viaje.metodoPagoChofer.descripcion) : null}
          </Dato>
        </dl>
      </section>
    </Card>
  );
}

export default DatosAdministrativosViaje;
