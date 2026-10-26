import ModalMarco from '../documentacion/ModalMarco';
import { TAREAS_SERVICE } from '../../constants/mantenimiento';
import { formatearFechaCorta, formatearKm } from '../../utils/viajeFormato';
import { textoIncluyeService, textoTrabajos } from '../../utils/mantenimiento';

const NO_REGISTRADO = 'No registrado';

function Dato({ etiqueta, ancho = false, children }) {
  return (
    <div className={ancho ? 'detalle-item detalle-item-ancho' : 'detalle-item'}>
      <dt>{etiqueta}</dt>
      <dd>{children || NO_REGISTRADO}</dd>
    </div>
  );
}

// Todo lo de un service o un arreglo del historial, de solo lectura: la tarjeta
// muestra un resumen y esto se abre al tocarla. Los pares siguen el patrón de
// FichaDetalle. Se monta solo mientras está abierto.
function ModalDetalleRegistro({ registro, onClose }) {
  const { vehiculo } = registro;
  const esService = registro.tipo === 'SERVICE';

  return (
    <ModalMarco
      titulo={esService ? 'Service' : 'Arreglo'}
      subtitulo={
        <>
          {vehiculo.numeroInterno} - <span className="patente">{vehiculo.dominio}</span> · {vehiculo.marca}{' '}
          {vehiculo.modelo}
        </>
      }
      onClose={onClose}
    >
      <dl className="detalle-grid">
        <Dato etiqueta="Fecha del trabajo">{formatearFechaCorta(registro.fecha)}</Dato>
        <Dato etiqueta="Km del odómetro">{`${formatearKm(registro.kilometraje)} km`}</Dato>
        {esService ? (
          <Dato etiqueta="Incluye" ancho>
            {textoIncluyeService(TAREAS_SERVICE)}
          </Dato>
        ) : (
          <>
            <Dato etiqueta="Trabajos realizados" ancho>
              {textoTrabajos(registro)}
            </Dato>
            {/* Los arreglos ya no piden observaciones: si uno viejo solo tiene
                eso, se muestra como descripción. */}
            <Dato etiqueta="Descripción" ancho>
              {registro.descripcion || registro.observaciones}
            </Dato>
            <Dato etiqueta="Repuestos" ancho>
              {registro.repuestos}
            </Dato>
          </>
        )}
        {esService && (
          <Dato etiqueta="Observaciones" ancho>
            {registro.observaciones}
          </Dato>
        )}
        {/* El service no pide quién lo hizo: solo el arreglo lleva "Hizo". */}
        {!esService && <Dato etiqueta="Hizo">{registro.responsable}</Dato>}
        <Dato etiqueta="Registró">{registro.usuario}</Dato>
        <Dato etiqueta="Cargado el">{registro.creadoEn && formatearFechaCorta(registro.creadoEn)}</Dato>
        {!esService && <div className="detalle-hueco" aria-hidden="true" />}
      </dl>
    </ModalMarco>
  );
}

export default ModalDetalleRegistro;
