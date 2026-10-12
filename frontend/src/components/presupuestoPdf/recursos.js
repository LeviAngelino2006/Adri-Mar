// ÚNICO lugar donde el PDF del presupuesto referencia sus imágenes. Para pasar a
// las versiones en alta resolución alcanza con reemplazar los archivos (mismo
// nombre): encabezado y pie en src/assets/presupuesto/, firmas en el backend
// (ver backend/src/services/firmaPresupuestoService.js). Las medidas del layout
// salen de la proporción de cada imagen, no de su tamaño en píxeles.
//
// Este módulo solo lo importa generarPdfPresupuesto, que se carga con import()
// dinámico: las imágenes no entran en el bundle inicial.
//
// encabezado-completo.png es la banda entera del Word (formas diagonales y
// logo) a 300 dpi, una sola imagen a todo el ancho. El logo que trae adentro
// está en baja resolución: se reemplaza la imagen cuando lleguen los originales.
import encabezado from '../../assets/presupuesto/encabezado-completo.png';
import pie from '../../assets/presupuesto/pie.png';

export const IMAGEN_ENCABEZADO = encabezado;
export const IMAGEN_PIE = pie;

// Proporción alto / ancho de cada imagen (2481 × 438 y 1588 × 195). Si las
// nuevas tienen otra proporción, actualizar acá.
export const PROPORCION_ENCABEZADO = 438 / 2481;
export const PROPORCION_PIE = 195 / 1588;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Fuente de <Image> para una firma: la pide al backend con el token de la
// sesión (el endpoint es solo para Administrador y Encargado).
export function fuenteFirma(archivo, token) {
  return {
    uri: `${API_URL}/presupuestos/assets/firma/${archivo}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  };
}
