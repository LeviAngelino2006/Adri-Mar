// Tests de los textos de la pantalla de Documentación (listado y tarjetas de la
// ficha). Se corren con `npm test` (node:test, sin dependencias). "Ahora" es
// siempre un parámetro, y las fechas de vencimiento se escriben como las guarda
// el backend para un día calendario: 12:00 UTC (09:00 en Córdoba).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  contadoresResumen,
  diasHasta,
  formatearFechaCorta,
  iniciales,
  lineaDetalleListado,
  lineaFechasDocumento,
  listaConY,
  textoDocumentosCargados,
} from './documentacion.js';

const AHORA = Date.parse('2026-10-09T15:00:00Z'); // 12:00 del 9 de octubre en Córdoba
const dia = (iso) => `${iso}T12:00:00Z`;

describe('formatearFechaCorta', () => {
  test('día y mes abreviado, con el año cuando se pide', () => {
    assert.equal(formatearFechaCorta(dia('2026-10-02'), { anio: 'siempre' }), '02 oct 2026');
    assert.equal(formatearFechaCorta(dia('2026-12-22')), '22 dic 2026');
  });

  test('sin año si es el año en curso; con año si no lo es', () => {
    assert.equal(formatearFechaCorta(dia('2026-10-02'), { anio: 'si-distinto', ahora: AHORA }), '02 oct');
    assert.equal(formatearFechaCorta(dia('2027-01-15'), { anio: 'si-distinto', ahora: AHORA }), '15 ene 2027');
  });

  test('el día es el de Córdoba aunque en UTC ya sea el siguiente', () => {
    // 22:00 del 20 de octubre en Córdoba = 01:00Z del 21.
    assert.equal(formatearFechaCorta('2026-10-21T01:00:00Z'), '20 oct 2026');
  });
});

describe('diasHasta', () => {
  test('cuenta días de calendario en Córdoba', () => {
    assert.equal(diasHasta(dia('2026-10-13'), AHORA), 4);
    assert.equal(diasHasta(dia('2026-10-09'), AHORA), 0);
    assert.equal(diasHasta(dia('2026-10-02'), AHORA), -7);
  });

  test('de noche en Córdoba (día siguiente en UTC) sigue siendo el mismo día', () => {
    const ahora = Date.parse('2026-10-10T01:30:00Z'); // 22:30 del 9 en Córdoba
    assert.equal(diasHasta(dia('2026-10-09'), ahora), 0);
  });
});

describe('listaConY', () => {
  test('une con comas y "y"', () => {
    assert.equal(listaConY(['A']), 'A');
    assert.equal(listaConY(['A', 'B']), 'A y B');
    assert.equal(listaConY(['A', 'B', 'C']), 'A, B y C');
  });
});

describe('lineaDetalleListado', () => {
  test('vencida: el documento más urgente y su fecha, sin año si es el actual', () => {
    const item = {
      estadoDocumentacion: 'VENCIDA',
      documentoUrgente: { tipo: 'ITV', fechaVencimiento: dia('2026-10-02'), estadoVigencia: 'VENCIDO' },
    };
    assert.equal(lineaDetalleListado(item, AHORA), 'Inspección Técnica Vehicular (ITV) venció el 02 oct');
  });

  test('por vencer', () => {
    const item = {
      estadoDocumentacion: 'POR_VENCER',
      documentoUrgente: { tipo: 'PAGO_SEGURO', fechaVencimiento: dia('2026-10-13'), estadoVigencia: 'POR_VENCER' },
    };
    assert.equal(lineaDetalleListado(item, AHORA), 'Comprobante de pago de seguro vence el 13 oct');
  });

  test('un año distinto del actual se escribe', () => {
    const item = {
      estadoDocumentacion: 'VENCIDA',
      documentoUrgente: { tipo: 'ITV', fechaVencimiento: dia('2025-12-30'), estadoVigencia: 'VENCIDO' },
    };
    assert.match(lineaDetalleListado(item, AHORA), /venció el 30 dic 2025$/);
  });

  test('incompleta: "Falta: X" con uno y "Faltan N: A, B y C" con varios', () => {
    assert.equal(
      lineaDetalleListado({ estadoDocumentacion: 'INCOMPLETA', faltantes: ['TITULO_VEHICULO'] }, AHORA),
      'Falta: Título del automotor'
    );
    assert.equal(
      lineaDetalleListado(
        { estadoDocumentacion: 'INCOMPLETA', faltantes: ['TITULO_VEHICULO', 'CEDULA_IDENTIFICACION', 'ALTA_TRANSPORTE'] },
        AHORA
      ),
      'Faltan 3: Título del automotor, Cédula de identificación (Tarjeta Verde) y Certificado de alta de transporte'
    );
  });

  test('al día: próximo vencimiento, o nada si ningún documento vence', () => {
    const conVencimiento = {
      estadoDocumentacion: 'AL_DIA',
      proximoVencimiento: { tipo: 'POLIZA_SEGURO', fechaVencimiento: dia('2026-12-22') },
    };
    assert.equal(lineaDetalleListado(conVencimiento, AHORA), 'Próximo vencimiento: Póliza de seguro, 22 dic');
    assert.equal(lineaDetalleListado({ estadoDocumentacion: 'AL_DIA', proximoVencimiento: null }, AHORA), null);
  });

  test('un tipo que no está en las constantes muestra su código', () => {
    const item = { estadoDocumentacion: 'INCOMPLETA', faltantes: ['TIPO_NUEVO'] };
    assert.equal(lineaDetalleListado(item, AHORA), 'Falta: TIPO_NUEVO');
  });
});

describe('textoDocumentosCargados y contadoresResumen', () => {
  test('"7 de 8 documentos cargados"', () => {
    assert.equal(textoDocumentosCargados({ totalCargados: 7, totalRequeridos: 8 }), '7 de 8 documentos cargados');
  });

  test('omite los contadores en cero y concuerda el plural', () => {
    assert.deepEqual(contadoresResumen({ totalCargados: 7, totalRequeridos: 8, totalVencidos: 1, totalPorVencer: 1 }), [
      { numero: '7 de 8', texto: 'documentos cargados' },
      { numero: 1, texto: 'vencido' },
      { numero: 1, texto: 'por vencer' },
    ]);
    assert.deepEqual(contadoresResumen({ totalCargados: 8, totalRequeridos: 8, totalVencidos: 0, totalPorVencer: 0 }), [
      { numero: '8 de 8', texto: 'documentos cargados' },
    ]);
    assert.equal(contadoresResumen({ totalCargados: 1, totalRequeridos: 8, totalVencidos: 3, totalPorVencer: 0 })[1].texto, 'vencidos');
  });
});

describe('lineaFechasDocumento', () => {
  const tipoConPdf = { requiereArchivo: true };
  const doc = (campos) => ({ creadoEn: '2026-03-12T15:00:00Z', ...campos });

  test('vigente con vencimiento', () => {
    const r = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: dia('2026-12-22'), estadoVigencia: 'VIGENTE' }), AHORA);
    assert.deepEqual(r, { texto: 'Vence el 22 dic 2026', vencido: false });
  });

  test('por vencer: con los días que faltan, y "hoy" el mismo día', () => {
    const enCuatro = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: dia('2026-10-13'), estadoVigencia: 'POR_VENCER' }), AHORA);
    assert.equal(enCuatro.texto, 'Vence el 13 oct 2026, en 4 días');
    const enUno = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: dia('2026-10-10'), estadoVigencia: 'POR_VENCER' }), AHORA);
    assert.equal(enUno.texto, 'Vence el 10 oct 2026, en 1 día');
    const hoy = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: dia('2026-10-09'), estadoVigencia: 'POR_VENCER' }), AHORA);
    assert.equal(hoy.texto, 'Vence hoy, 09 oct 2026');
  });

  test('vencido: hace cuántos días y marcado', () => {
    const r = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: dia('2026-10-02'), estadoVigencia: 'VENCIDO' }), AHORA);
    assert.deepEqual(r, { texto: 'Venció el 02 oct 2026, hace 7 días', vencido: true });
  });

  test('sin vencimiento: fecha de carga', () => {
    const r = lineaFechasDocumento(tipoConPdf, doc({ fechaVencimiento: null, estadoVigencia: 'VIGENTE' }), AHORA);
    assert.equal(r.texto, 'Cargado el 12 mar 2026');
  });

  test('un tipo sin PDF aclara que solo se registra la vigencia', () => {
    const r = lineaFechasDocumento({ requiereArchivo: false }, doc({ fechaVencimiento: dia('2026-12-22'), estadoVigencia: 'VIGENTE' }), AHORA);
    assert.equal(r.texto, 'Vence el 22 dic 2026 · Solo se registra la vigencia');
  });

  test('pendiente: todavía no se cargó', () => {
    assert.deepEqual(lineaFechasDocumento(tipoConPdf, null, AHORA), { texto: 'Todavía no se cargó', vencido: false });
  });
});

describe('iniciales', () => {
  test('primera letra del nombre y del apellido, en mayúsculas', () => {
    assert.equal(iniciales('ana', 'pérez'), 'AP');
    assert.equal(iniciales('Ana', undefined), 'A');
  });
});
