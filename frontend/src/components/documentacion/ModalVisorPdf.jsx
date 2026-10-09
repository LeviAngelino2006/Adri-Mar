import Button from '../ui/Button';
import ModalMarco from './ModalMarco';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { formatearFechaCorta } from '../../utils/documentacion';
import { formatearNombreArchivo } from '../../utils/archivoFormato';
import { descargarPdf } from '../../utils/descargarPdf';

// Visor del PDF de una versión. `url` es la URL firmada que pidió la página al
// abrirlo (dura 5 minutos). Se monta solo mientras está abierto.
function ModalVisorPdf({ documento, url, subtitulo, onClose }) {
  const nombreArchivo = formatearNombreArchivo(documento.nombreArchivo);
  const subidoPor = documento.usuario ? ` por ${documento.usuario.nombre} ${documento.usuario.apellido}` : '';

  return (
    <ModalMarco
      titulo={documento.tipoDocumento ? etiquetaTipoDocumento(documento.tipoDocumento.descripcion) : 'Documento'}
      subtitulo={subtitulo}
      onClose={onClose}
      variante="visor"
      pie={
        <>
          <p className="doc-visor-meta">
            {nombreArchivo ? `${nombreArchivo} · ` : ''}Subido el {formatearFechaCorta(documento.creadoEn)}
            {subidoPor}
          </p>
          <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
            Abrir en otra pestaña
          </a>
          <Button
            variant="primary"
            onClick={() =>
              descargarPdf(url, {
                nombreArchivo: documento.nombreArchivo,
                codigoTipo: documento.tipoDocumento?.descripcion,
              })
            }
          >
            Descargar PDF
          </Button>
        </>
      }
    >
      <iframe src={url} title={nombreArchivo || 'Visor de PDF'} className="doc-visor-marco" />
    </ModalMarco>
  );
}

export default ModalVisorPdf;
