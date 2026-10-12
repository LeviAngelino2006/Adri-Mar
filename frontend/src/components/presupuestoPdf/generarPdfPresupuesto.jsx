import { pdf } from '@react-pdf/renderer';
import PresupuestoPDF from './PresupuestoPDF';
import { getToken } from '../../services/authStorage';
import { nombreArchivoPresupuesto } from '../../utils/presupuestos';

// Punto de entrada del generador de PDF. La pantalla lo carga con import()
// dinámico recién al tocar "Descargar PDF": @react-pdf/renderer, el layout y
// las imágenes quedan en un chunk aparte, fuera del bundle inicial.

// Arma el PDF del presupuesto (el objeto de GET /presupuestos/:id) como Blob.
export async function generarPdfPresupuesto(presupuesto) {
  return pdf(<PresupuestoPDF presupuesto={presupuesto} token={getToken()} />).toBlob();
}

// Genera el PDF y lo descarga con el nombre "Presupuesto - <Cliente> - <dd-mm-aaaa>.pdf".
export async function descargarPdfPresupuesto(presupuesto) {
  const blob = await generarPdfPresupuesto(presupuesto);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoPresupuesto(presupuesto);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después: algunos navegadores leen el blob en forma asíncrona.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
