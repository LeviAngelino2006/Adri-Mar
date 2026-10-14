import Button from '../ui/Button';
import EstadoBadge from '../ui/EstadoBadge';
import { ESTADOS_DOCUMENTO } from '../../constants/estadosDocumentacion';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { lineaFechasDocumento } from '../../utils/documentacion';
import './TarjetaDocumento.css';

// Una tarjeta por tipo de documento en la ficha de un vehículo o chofer. `item`
// es un elemento de `documentos` de la carpeta: { tipo, cargado, cantidadVersiones,
// documento }. Con `soloConsulta` no se ofrece cargar ni actualizar.
function TarjetaDocumento({ item, soloConsulta, onVerPdf, onActualizar, onHistorial }) {
  const { tipo, documento, cantidadVersiones } = item;
  const estado = ESTADOS_DOCUMENTO[documento?.estadoVigencia ?? 'PENDIENTE'];
  const fechas = lineaFechasDocumento(tipo, documento);

  return (
    <article className="doc-tarjeta">
      <div className="doc-tarjeta-info">
        <div className="doc-tarjeta-titulo">
          <h3 className="doc-tarjeta-nombre">{etiquetaTipoDocumento(tipo.descripcion)}</h3>
          <EstadoBadge tono={estado.tono} size="sm">
            {estado.label}
          </EstadoBadge>
        </div>
        <p className={fechas.vencido ? 'doc-tarjeta-fechas is-vencido' : 'doc-tarjeta-fechas'}>{fechas.texto}</p>
      </div>

      <div className="doc-tarjeta-acciones">
        {documento ? (
          <>
            {documento.tieneArchivo && (
              <Button variant="secondary" onClick={() => onVerPdf(documento)}>
                Ver PDF
              </Button>
            )}
            {!soloConsulta && (
              <Button variant="secondary" onClick={() => onActualizar(tipo, documento)}>
                Actualizar
              </Button>
            )}
            {cantidadVersiones > 1 && (
              <Button variant="secondary" onClick={() => onHistorial(tipo)}>
                Historial
              </Button>
            )}
          </>
        ) : (
          !soloConsulta && (
            <Button variant="primary" onClick={() => onActualizar(tipo, null)}>
              Cargar documento
            </Button>
          )
        )}
      </div>
    </article>
  );
}

export default TarjetaDocumento;
