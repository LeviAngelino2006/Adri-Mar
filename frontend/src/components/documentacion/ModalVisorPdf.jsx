import { Component, lazy, Suspense, useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import ModalMarco from './ModalMarco';
import { etiquetaTipoDocumento } from '../../constants/tiposDocumento';
import { formatearFechaCorta } from '../../utils/documentacion';
import { formatearNombreArchivo } from '../../utils/archivoFormato';
import { descargarPdf } from '../../utils/descargarPdf';

// El visor y react-pdf (pdf.js) se bajan recién cuando se abre el modal.
const VisorPdf = lazy(() => import('./VisorPdf'));

// Si el chunk del visor no baja (sin conexión, deploy nuevo), muestra `fallback`
// en vez de dejar la página en blanco.
class LimiteErrorVisor extends Component {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  render() {
    return this.state.fallo ? this.props.fallback : this.props.children;
  }
}

// Visor del PDF de una versión. `url` es la URL firmada que pidió la página al
// abrirlo (dura 5 minutos). Se monta solo mientras está abierto. Si el PDF no se
// puede mostrar, el pie sigue ofreciendo abrirlo en otra pestaña o descargarlo.
function ModalVisorPdf({ documento, url, subtitulo, onClose }) {
  const [fallo, setFallo] = useState(false);
  const nombreArchivo = formatearNombreArchivo(documento.nombreArchivo);
  const subidoPor = documento.usuario ? ` por ${documento.usuario.nombre} ${documento.usuario.apellido}` : '';
  const avisoError = <Alert variant="error">No se pudo mostrar el PDF.</Alert>;

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
      {fallo ? (
        avisoError
      ) : (
        <LimiteErrorVisor fallback={avisoError}>
          <Suspense
            fallback={
              <div className="doc-visor-cargando">
                <Spinner size="lg" label="Cargando visor…" />
              </div>
            }
          >
            <VisorPdf url={url} titulo={nombreArchivo || 'el documento'} onError={() => setFallo(true)} />
          </Suspense>
        </LimiteErrorVisor>
      )}
    </ModalMarco>
  );
}

export default ModalVisorPdf;
