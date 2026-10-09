import { etiquetaTipoDocumento } from '../constants/tiposDocumento.js';
import { fechaCordobaISO } from './fechaCordoba.js';

// Textos de la pantalla de Documentación: fechas cortas en hora de Córdoba y las
// líneas de resumen del listado y de las tarjetas de la ficha. Son funciones
// puras (reciben `ahora`) para poder probarlas sin reloj.

const TZ_CORDOBA = 'America/Argentina/Cordoba';
const FORMATO_DIA = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, day: '2-digit' });
const FORMATO_MES = new Intl.DateTimeFormat('es-AR', { timeZone: TZ_CORDOBA, month: 'short' });
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const anioCordoba = (valor) => Number(fechaCordobaISO(valor).slice(0, 4));

// "02 oct" o "02 oct 2026". `anio`: 'siempre' | 'si-distinto' (solo cuando no es
// el año en curso, para los textos compactos del listado).
export function formatearFechaCorta(valor, { anio = 'siempre', ahora = Date.now() } = {}) {
  const fecha = new Date(valor);
  const mes = FORMATO_MES.format(fecha).replace('.', '');
  const base = `${FORMATO_DIA.format(fecha)} ${mes}`;
  const conAnio = anio === 'siempre' || anioCordoba(fecha) !== anioCordoba(ahora);
  return conAnio ? `${base} ${anioCordoba(fecha)}` : base;
}

// Días de calendario (en Córdoba) desde hoy hasta la fecha; negativo si ya pasó.
export function diasHasta(valor, ahora = Date.now()) {
  return (Date.parse(fechaCordobaISO(valor)) - Date.parse(fechaCordobaISO(ahora))) / MS_POR_DIA;
}

// "A", "A y B", "A, B y C".
export function listaConY(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const plural = (n, singular, pluralTexto) => (n === 1 ? singular : pluralTexto);

// La línea del problema más urgente de una tarjeta del listado. `item` es un
// elemento de /estado-flota o /estado-choferes. null si no hay nada que decir
// (al día y sin ningún documento con vencimiento).
export function lineaDetalleListado(item, ahora = Date.now()) {
  const fecha = (valor) => formatearFechaCorta(valor, { anio: 'si-distinto', ahora });

  switch (item.estadoDocumentacion) {
    case 'VENCIDA': {
      const { tipo, fechaVencimiento } = item.documentoUrgente;
      return `${etiquetaTipoDocumento(tipo)} venció el ${fecha(fechaVencimiento)}`;
    }
    case 'POR_VENCER': {
      const { tipo, fechaVencimiento } = item.documentoUrgente;
      return `${etiquetaTipoDocumento(tipo)} vence el ${fecha(fechaVencimiento)}`;
    }
    case 'INCOMPLETA': {
      const etiquetas = item.faltantes.map(etiquetaTipoDocumento);
      return etiquetas.length === 1
        ? `Falta: ${etiquetas[0]}`
        : `Faltan ${etiquetas.length}: ${listaConY(etiquetas)}`;
    }
    default:
      return item.proximoVencimiento
        ? `Próximo vencimiento: ${etiquetaTipoDocumento(item.proximoVencimiento.tipo)}, ${fecha(item.proximoVencimiento.fechaVencimiento)}`
        : null;
  }
}

// "7 de 8 documentos cargados" (pie de las tarjetas del listado).
export function textoDocumentosCargados(item) {
  return `${item.totalCargados} de ${item.totalRequeridos} documentos cargados`;
}

// Contadores del resumen de la ficha, sin los que están en cero:
// [{ numero: '7 de 8', texto: 'documentos cargados' }, { numero: 1, texto: 'vencido' }, ...]
export function contadoresResumen(resumen) {
  const contadores = [
    { numero: `${resumen.totalCargados} de ${resumen.totalRequeridos}`, texto: 'documentos cargados' },
  ];
  if (resumen.totalVencidos > 0) {
    contadores.push({ numero: resumen.totalVencidos, texto: plural(resumen.totalVencidos, 'vencido', 'vencidos') });
  }
  if (resumen.totalPorVencer > 0) {
    contadores.push({ numero: resumen.totalPorVencer, texto: 'por vencer' });
  }
  return contadores;
}

const textoDias = (dias) => `${dias} ${plural(dias, 'día', 'días')}`;

// Línea de fechas de la tarjeta de un documento. `vencido` marca el texto en
// rojo. `documento` es null si todavía no se cargó.
export function lineaFechasDocumento(tipo, documento, ahora = Date.now()) {
  if (!documento) return { texto: 'Todavía no se cargó', vencido: false };

  let texto;
  let vencido = false;
  if (documento.fechaVencimiento) {
    const fecha = formatearFechaCorta(documento.fechaVencimiento);
    const dias = diasHasta(documento.fechaVencimiento, ahora);
    if (dias < 0) {
      texto = `Venció el ${fecha}, hace ${textoDias(-dias)}`;
      vencido = true;
    } else if (documento.estadoVigencia === 'POR_VENCER') {
      texto = dias === 0 ? `Vence hoy, ${fecha}` : `Vence el ${fecha}, en ${textoDias(dias)}`;
    } else {
      texto = `Vence el ${fecha}`;
    }
  } else {
    texto = `Cargado el ${formatearFechaCorta(documento.creadoEn)}`;
  }

  if (!tipo.requiereArchivo) texto += ' · Solo se registra la vigencia';
  return { texto, vencido };
}

// Iniciales para el avatar de un chofer.
export function iniciales(nombre, apellido) {
  return `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase();
}
