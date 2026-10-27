import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  CLAUSULA_MODIFICACIONES,
  CONTACTO,
  FIRMANTES,
  TEXTO_INTRODUCCION,
} from '../../constants/presupuesto';
import { aCentavos } from '../../utils/importes';
import { ACLARACION_IVA } from '../../utils/ivaPresupuesto';
import { formatearPesos } from '../../utils/moneda';
import { fechaVencimiento, formatearFechaDocumento, textoHorario } from '../../utils/presupuestos';
import { fuenteFirma, IMAGEN_ENCABEZADO, IMAGEN_PIE, PROPORCION_ENCABEZADO, PROPORCION_PIE } from './recursos';

// PDF del presupuesto, en A4, replicando el Word que se usaba. Se arma SOLO
// con el objeto de GET /presupuestos/:id (datos guardados, incluida la
// descripción snapshot de cada unidad), así que generarlo y re-descargarlo da
// el mismo documento. Debajo del importe va la aclaración del IVA, el mismo
// texto que el formulario (utils/ivaPresupuesto.js).
//
// Una sola familia tipográfica: Helvetica (normal y negrita), una de las 14
// fuentes estándar de PDF. Muestra bien tildes, ñ, "$", "°" y el espacio duro
// que pone Intl entre "$" y el número (todos están en WinAnsi), así que no hace
// falta registrar una TTF.

const ANCHO_A4 = 595.28;
const MARGEN = 56;
const AZUL = '#005380'; // el azul de la banda del pie
const GRIS_TEXTO = '#404040';
const GRIS_BORDE = '#BFBFBF';
const GRIS_FONDO = '#F2F2F2'; // el gris claro del pie

const ALTO_PIE = ANCHO_A4 * PROPORCION_PIE;

const estilos = StyleSheet.create({
  pagina: {
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    lineHeight: 1.35,
    color: '#1A1A1A',
    paddingBottom: ALTO_PIE + 24,
  },
  // La banda completa del Word (formas y logo) como una sola imagen, a todo el ancho.
  encabezado: {
    width: ANCHO_A4,
    height: ANCHO_A4 * PROPORCION_ENCABEZADO,
  },
  cuerpo: {
    paddingHorizontal: MARGEN,
    paddingTop: 22,
  },
  filaTitulo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  titulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    letterSpacing: 1,
    color: AZUL,
  },
  fecha: {
    fontSize: 10.5,
  },
  destinatario: {
    marginBottom: 6,
  },
  negrita: {
    fontFamily: 'Helvetica-Bold',
  },
  introduccion: {
    marginBottom: 14,
  },
  tituloSeccion: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: AZUL,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tabla: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: GRIS_BORDE,
    marginBottom: 14,
  },
  fila: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: GRIS_BORDE,
  },
  celdaEtiqueta: {
    width: '36%',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: GRIS_FONDO,
    fontFamily: 'Helvetica-Bold',
    borderRightWidth: 1,
    borderColor: GRIS_BORDE,
  },
  celdaValor: {
    width: '64%',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: GRIS_BORDE,
  },
  // Aclaración del IVA, debajo del importe (como la cláusula).
  notaImporte: {
    fontSize: 9.5,
    color: GRIS_TEXTO,
    marginTop: 2,
  },
  clausula: {
    fontSize: 9.5,
    color: GRIS_TEXTO,
    marginBottom: 26,
  },
  firmas: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  firma: {
    width: 190,
    alignItems: 'center',
  },
  imagenFirma: {
    height: 62,
    objectFit: 'contain',
    marginBottom: 2,
  },
  lineaFirma: {
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderColor: '#1A1A1A',
    marginBottom: 4,
  },
  pie: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ALTO_PIE,
  },
  imagenPie: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ANCHO_A4,
    height: ALTO_PIE,
  },
  contacto: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: ALTO_PIE,
    color: '#FFFFFF',
    fontSize: 9.5,
  },
  separadorContacto: {
    marginHorizontal: 10,
  },
});

function Fila({ etiqueta, children }) {
  return (
    <View style={estilos.fila} wrap={false}>
      <Text style={estilos.celdaEtiqueta}>{etiqueta}</Text>
      <View style={estilos.celdaValor}>
        {typeof children === 'string' ? (
          <Text>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function PresupuestoPDF({ presupuesto, token }) {
  const importe = aCentavos(presupuesto.importeNeto);
  const vence = fechaVencimiento(presupuesto.fechaEmision, presupuesto.diasValidez);
  const unidades = presupuesto.unidades.length === 1 ? 'Unidad asignada' : 'Unidades asignadas';
  // Fecha fija del documento (la de creación del presupuesto): sin esto
  // react-pdf usa "ahora" y cada descarga daría un archivo distinto.
  const creado = new Date(presupuesto.creadoEn);

  return (
    <Document
      title={`Presupuesto - ${presupuesto.cliente.nombre}`}
      author="Adri Mar Viajes"
      creator="Adri-Mar Gestión"
      producer="Adri-Mar Gestión"
      language="es-AR"
      creationDate={creado}
      modificationDate={creado}
    >
      <Page size="A4" style={estilos.pagina}>
        <Image src={IMAGEN_ENCABEZADO} style={estilos.encabezado} />

        <View style={estilos.cuerpo}>
          <View style={estilos.filaTitulo}>
            <Text style={estilos.titulo}>PRESUPUESTO</Text>
            <Text style={estilos.fecha}>Fecha: {formatearFechaDocumento(presupuesto.fechaEmision)}</Text>
          </View>

          <Text style={estilos.destinatario}>
            Sr/Sra: <Text style={estilos.negrita}>{presupuesto.cliente.nombre}</Text>
          </Text>
          <Text style={estilos.introduccion}>{TEXTO_INTRODUCCION}</Text>

          <Text style={estilos.tituloSeccion}>DETALLE DEL SERVICIO</Text>
          <View style={estilos.tabla}>
            <Fila etiqueta="Origen">{presupuesto.origen.nombre}</Fila>
            <Fila etiqueta="Destino">{presupuesto.destino.nombre}</Fila>
            <Fila etiqueta="Fecha del servicio">{formatearFechaDocumento(presupuesto.fechaServicio)}</Fila>
            <Fila etiqueta="Horario de salida">{textoHorario(presupuesto.horaSalida)}</Fila>
            <Fila etiqueta="Cantidad de pasajeros">{String(presupuesto.cantidadPasajeros)}</Fila>
            <Fila etiqueta={unidades}>
              {presupuesto.unidades.map((unidad) => (
                <Text key={unidad.id}>{unidad.descripcion}</Text>
              ))}
            </Fila>
          </View>

          <Text style={estilos.tituloSeccion}>VALOR DEL SERVICIO</Text>
          <View style={estilos.tabla}>
            <Fila etiqueta="Importe">
              <Text style={estilos.negrita}>{formatearPesos(importe)}</Text>
              <Text style={estilos.notaImporte}>{ACLARACION_IVA}</Text>
            </Fila>
            <Fila etiqueta="Forma de pago">{presupuesto.formaPago}</Fila>
            <Fila etiqueta="Validez">
              {`${presupuesto.diasValidez} ${presupuesto.diasValidez === 1 ? 'día' : 'días'} a partir de la fecha de emisión (hasta el ${formatearFechaDocumento(vence)})`}
            </Fila>
          </View>

          <Text style={estilos.clausula}>{CLAUSULA_MODIFICACIONES}</Text>

          <View style={estilos.firmas} wrap={false}>
            {FIRMANTES.map((firmante) => (
              <View key={firmante.archivo} style={estilos.firma}>
                <Image src={fuenteFirma(firmante.archivo, token)} style={estilos.imagenFirma} />
                <View style={estilos.lineaFirma} />
                <Text>{firmante.nombre}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={estilos.pie} fixed>
          <Image src={IMAGEN_PIE} style={estilos.imagenPie} />
          <View style={estilos.contacto}>
            <Text>Teléfono: {CONTACTO.telefono}</Text>
            <Text style={estilos.separadorContacto}>·</Text>
            <Text>Email: {CONTACTO.email}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default PresupuestoPDF;
