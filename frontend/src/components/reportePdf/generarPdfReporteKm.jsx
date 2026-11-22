import { pdf } from '@react-pdf/renderer';
import ReporteKmPDF from './ReporteKmPDF';
import { nombreArchivoReportePdf } from '../../utils/reporteKm';

export async function descargarPdfReporteKm(reporte, itemsVisibles, { esFiltrado = false } = {}) {
  const blob = await pdf(
    <ReporteKmPDF reporte={reporte} itemsVisibles={itemsVisibles} esFiltrado={esFiltrado} emitidoEl={new Date()} />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoReportePdf(reporte.periodo.desde, reporte.periodo.hasta);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
