import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatearDesvio, formatearRangoPeriodo, partirTokenPdf } from '../../utils/reporteKm';
import { formatearFechaCorta, formatearKm } from '../../utils/viajeFormato';

const AZUL = '#0535a6';
const GRIS_BORDE = '#cbd5e1';
const GRIS_FONDO = '#f1f5f9';
const GRIS_TEXTO = '#475569';
const TEXTO = '#1e293b';

const sinGuiones = (palabra) => [palabra];
const partirInterno = (palabra) => partirTokenPdf(palabra, 9);
const partirVehiculo = (palabra) => partirTokenPdf(palabra, 16);

const estilos = StyleSheet.create({
  pagina: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    lineHeight: 1.35,
    color: TEXTO,
    paddingTop: 36,
    paddingBottom: 42,
    paddingHorizontal: 36,
  },
  encabezado: {
    borderBottomWidth: 2,
    borderBottomColor: AZUL,
    paddingBottom: 10,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  marca: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: AZUL,
    marginBottom: 2,
  },
  titulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: TEXTO,
  },
  metaDerecha: {
    alignItems: 'flex-end',
  },
  metaTexto: {
    fontSize: 8.5,
    color: GRIS_TEXTO,
  },
  kpis: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GRIS_BORDE,
    borderRadius: 4,
    backgroundColor: GRIS_FONDO,
    marginBottom: 14,
  },
  kpi: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: GRIS_BORDE,
  },
  kpiUltimo: {
    borderRightWidth: 0,
  },
  kpiEtiqueta: {
    fontSize: 8,
    color: GRIS_TEXTO,
    marginBottom: 2,
  },
  kpiValor: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: TEXTO,
  },
  kpiDetalle: {
    fontSize: 7.5,
    color: GRIS_TEXTO,
    marginTop: 2,
  },
  tabla: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: GRIS_BORDE,
  },
  fila: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: GRIS_BORDE,
    alignItems: 'stretch',
  },
  filaCabecera: {
    backgroundColor: AZUL,
    color: '#ffffff',
  },
  filaTotal: {
    backgroundColor: GRIS_FONDO,
  },
  celda: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GRIS_BORDE,
    justifyContent: 'center',
  },
  celdaTexto: {
    fontSize: 8.5,
  },
  textoCabecera: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#ffffff',
  },
  textoNegrita: {
    fontFamily: 'Helvetica-Bold',
  },
  textoDerecha: {
    textAlign: 'right',
  },
  colInterno: { width: '13%' },
  colDominio: { width: '12%' },
  colVehiculo: { width: '26%' },
  colTipo: { width: '13%' },
  colViajes: { width: '8%' },
  colKm: { width: '13%' },
  colPromedio: { width: '15%' },
  nota: {
    marginTop: 10,
    fontSize: 8,
    color: GRIS_TEXTO,
  },
  pie: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: GRIS_TEXTO,
  },
});

function ReporteKmPDF({ reporte, itemsVisibles, esFiltrado = false, emitidoEl }) {
  const { periodo, totales } = reporte;
  const textoPeriodo = formatearRangoPeriodo(periodo.desde, periodo.hasta);
  const textoEmision = formatearFechaCorta(emitidoEl);
  const sumaViajes = itemsVisibles.reduce((acc, item) => acc + item.cantidadViajes, 0);
  const sumaKm = itemsVisibles.reduce((acc, item) => acc + item.kmRecorridos, 0);

  return (
    <Document
      title={`Reporte de km y viajes - ${periodo.desde} a ${periodo.hasta}`}
      author="Adri Mar Viajes"
      creator="Adri-Mar Gestión"
      producer="Adri-Mar Gestión"
      language="es-AR"
      creationDate={emitidoEl}
      modificationDate={emitidoEl}
    >
      <Page size="A4" style={estilos.pagina}>
        <View style={estilos.encabezado}>
          <View>
            <Text style={estilos.marca} hyphenationCallback={sinGuiones}>
              Adri-Mar Gestión Online
            </Text>
            <Text style={estilos.titulo} hyphenationCallback={sinGuiones}>
              Reporte de km y viajes por vehículo
            </Text>
          </View>
          <View style={estilos.metaDerecha}>
            <Text style={estilos.metaTexto} hyphenationCallback={sinGuiones}>
              Período: {textoPeriodo}
            </Text>
            <Text style={estilos.metaTexto} hyphenationCallback={sinGuiones}>
              Emitido: {textoEmision}
            </Text>
          </View>
        </View>

        <View style={estilos.kpis}>
          <View style={estilos.kpi}>
            <Text style={estilos.kpiEtiqueta} hyphenationCallback={sinGuiones}>
              Km recorridos
            </Text>
            <Text style={estilos.kpiValor} hyphenationCallback={sinGuiones}>
              {formatearKm(totales.kmRecorridos)} km
            </Text>
          </View>
          <View style={estilos.kpi}>
            <Text style={estilos.kpiEtiqueta} hyphenationCallback={sinGuiones}>
              Viajes finalizados
            </Text>
            <Text style={estilos.kpiValor} hyphenationCallback={sinGuiones}>
              {String(totales.cantidadViajes)}
            </Text>
            <Text style={estilos.kpiDetalle} hyphenationCallback={sinGuiones}>
              {totales.promedioKmPorViaje != null
                ? `Prom. ${formatearKm(totales.promedioKmPorViaje)} km/viaje`
                : 'Sin km registrados'}
            </Text>
          </View>
          <View style={estilos.kpi}>
            <Text style={estilos.kpiEtiqueta} hyphenationCallback={sinGuiones}>
              Flota utilizada
            </Text>
            <Text style={estilos.kpiValor} hyphenationCallback={sinGuiones}>
              {totales.vehiculosConViajes} de {totales.vehiculosActivos}
            </Text>
            <Text style={estilos.kpiDetalle} hyphenationCallback={sinGuiones}>
              vehículos activos
            </Text>
          </View>
          <View style={[estilos.kpi, estilos.kpiUltimo]}>
            <Text style={estilos.kpiEtiqueta} hyphenationCallback={sinGuiones}>
              Desvío vs. estimado
            </Text>
            <Text style={estilos.kpiValor} hyphenationCallback={sinGuiones}>
              {formatearDesvio(totales.desvioPorcentaje, totales.desvioKm)}
            </Text>
          </View>
        </View>

        <View style={estilos.tabla}>
          <View style={[estilos.fila, estilos.filaCabecera]} fixed>
            <View style={[estilos.celda, estilos.colInterno]}>
              <Text style={estilos.textoCabecera} hyphenationCallback={sinGuiones}>
                Int.
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colDominio]}>
              <Text style={estilos.textoCabecera} hyphenationCallback={sinGuiones}>
                Dominio
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colVehiculo]}>
              <Text style={estilos.textoCabecera} hyphenationCallback={sinGuiones}>
                Vehículo
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colTipo]}>
              <Text style={estilos.textoCabecera} hyphenationCallback={sinGuiones}>
                Tipo
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colViajes]}>
              <Text style={[estilos.textoCabecera, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                Viajes
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colKm]}>
              <Text style={[estilos.textoCabecera, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                Km
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colPromedio]}>
              <Text style={[estilos.textoCabecera, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                Prom./viaje
              </Text>
            </View>
          </View>

          {itemsVisibles.map((item) => {
            const { vehiculo } = item;
            return (
              <View key={vehiculo.id} style={estilos.fila} wrap={false}>
                <View style={[estilos.celda, estilos.colInterno]}>
                  <Text style={estilos.celdaTexto} hyphenationCallback={partirInterno}>
                    {vehiculo.numeroInterno}
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colDominio]}>
                  <Text style={[estilos.celdaTexto, estilos.textoNegrita]} hyphenationCallback={partirInterno}>
                    {vehiculo.dominio}
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colVehiculo]}>
                  <Text style={estilos.celdaTexto} hyphenationCallback={partirVehiculo}>
                    {vehiculo.marca} {vehiculo.modelo}
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colTipo]}>
                  <Text style={estilos.celdaTexto} hyphenationCallback={sinGuiones}>
                    {vehiculo.tipoVehiculo}
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colViajes]}>
                  <Text style={[estilos.celdaTexto, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                    {String(item.cantidadViajes)}
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colKm]}>
                  <Text style={[estilos.celdaTexto, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                    {formatearKm(item.kmRecorridos)} km
                  </Text>
                </View>
                <View style={[estilos.celda, estilos.colPromedio]}>
                  <Text style={[estilos.celdaTexto, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                    {item.promedioKmPorViaje != null ? `${formatearKm(item.promedioKmPorViaje)} km` : 'No registrado'}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={[estilos.fila, estilos.filaTotal]} wrap={false}>
            <View style={[estilos.celda, estilos.colInterno]}>
              <Text style={[estilos.celdaTexto, estilos.textoNegrita]} hyphenationCallback={sinGuiones}>
                TOTAL
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colDominio]} />
            <View style={[estilos.celda, estilos.colVehiculo]}>
              <Text style={[estilos.celdaTexto, estilos.textoNegrita]} hyphenationCallback={sinGuiones}>
                {esFiltrado ? `${itemsVisibles.length} vehículos filtrados` : `${itemsVisibles.length} vehículos`}
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colTipo]} />
            <View style={[estilos.celda, estilos.colViajes]}>
              <Text style={[estilos.celdaTexto, estilos.textoNegrita, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                {String(sumaViajes)}
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colKm]}>
              <Text style={[estilos.celdaTexto, estilos.textoNegrita, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                {formatearKm(sumaKm)} km
              </Text>
            </View>
            <View style={[estilos.celda, estilos.colPromedio]}>
              <Text style={[estilos.celdaTexto, estilos.textoDerecha]} hyphenationCallback={sinGuiones}>
                {totales.promedioKmPorViaje != null && !esFiltrado
                  ? `${formatearKm(totales.promedioKmPorViaje)} km`
                  : 'No registrado'}
              </Text>
            </View>
          </View>
        </View>

        {totales.viajesSinOdometro > 0 && (
          <Text style={estilos.nota} hyphenationCallback={sinGuiones}>
            Nota: {totales.viajesSinOdometro}{' '}
            {totales.viajesSinOdometro === 1
              ? 'viaje finalizado no tiene lecturas completas de odómetro y no suma kilómetros reales.'
              : 'viajes finalizados no tienen lecturas completas de odómetro y no suman kilómetros reales.'}
          </Text>
        )}

        <View style={estilos.pie} fixed>
          <Text hyphenationCallback={sinGuiones}>Adri-Mar Gestión Online · Reporte operativo de flota</Text>
          <Text hyphenationCallback={sinGuiones} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default ReporteKmPDF;
