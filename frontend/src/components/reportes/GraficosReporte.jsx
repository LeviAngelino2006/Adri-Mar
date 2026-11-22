import { useState } from 'react';
import Card from '../ui/Card';
import ControlSegmentado from '../ui/ControlSegmentado';
import { calcularEscalaEjeY, etiquetaPuntoSerie, tituloPuntoSerie } from '../../utils/reporteKm';
import { formatearKm } from '../../utils/viajeFormato';

const OPCIONES_ACTIVIDAD = [
  { valor: 'km', etiqueta: 'Km' },
  { valor: 'viajes', etiqueta: 'Viajes' },
];

function hayHover() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

function porcentajeAncho(valor, maximo) {
  if (!valor || maximo <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((valor / maximo) * 1000) / 10));
}

export function GraficoPorTipoVehiculo({ porTipoVehiculo = [] }) {
  if (porTipoVehiculo.length === 0) return null;
  const maxKm = Math.max(1, ...porTipoVehiculo.map((t) => t.kmRecorridos));

  return (
    <Card className="reporte-grafico-card" role="region" aria-label="Km y viajes por tipo de vehículo">
      <div className="reporte-grafico-header">
        <h2>Km y viajes por tipo de vehículo</h2>
      </div>

      <ul className="reporte-tipo-lista">
        {porTipoVehiculo.map((tipo) => {
          const viajesTexto = tipo.cantidadViajes === 1 ? '1 viaje' : `${tipo.cantidadViajes} viajes`;
          let subtexto = 'Sin viajes en el período';
          if (tipo.cantidadViajes > 0) {
            subtexto =
              tipo.vehiculosActivos > 0
                ? `${tipo.vehiculosConViajes} de ${tipo.vehiculosActivos} activas`
                : `${tipo.vehiculosConViajes} ${tipo.vehiculosConViajes === 1 ? 'unidad' : 'unidades'}`;
          }
          const ancho = porcentajeAncho(tipo.kmRecorridos, maxKm);

          return (
            <li key={tipo.tipoVehiculoId} className="reporte-tipo-fila">
              <div className="reporte-tipo-top">
                <span className="reporte-tipo-nombre">
                  <strong>{tipo.tipoVehiculo}</strong>
                  <span className="reporte-tipo-sub">{subtexto}</span>
                </span>
                <span className="reporte-tipo-valor num">
                  {`${formatearKm(tipo.kmRecorridos)} km · ${viajesTexto}`}
                </span>
              </div>
              <div className="reporte-barra-track" aria-hidden="true">
                <span className="reporte-barra-fill-brand" style={{ width: `${ancho}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function GraficoActividadPeriodo({ serieTemporal = [], granularidadTemporal = 'dia' }) {
  const [metrica, setMetrica] = useState('km');
  const [claveSeleccionada, setClaveSeleccionada] = useState(null);

  if (serieTemporal.length === 0) return null;

  const valorDe = (punto) => (metrica === 'km' ? punto.kmRecorridos : punto.cantidadViajes);
  const maxBruto = Math.max(0, ...serieTemporal.map(valorDe));
  const { techo, marcas } = calcularEscalaEjeY(maxBruto);

  const puntoSeleccionado = claveSeleccionada
    ? serieTemporal.find((p) => p.clave === claveSeleccionada) ?? null
    : null;

  let puntoPico = serieTemporal[0];
  for (const punto of serieTemporal) {
    if (valorDe(punto) > valorDe(puntoPico)) puntoPico = punto;
  }

  const puntoMostrar = puntoSeleccionado ?? puntoPico;
  const prefijoDetalle = puntoSeleccionado ? '' : 'Pico: ';
  const viajesDetalle = puntoMostrar.cantidadViajes === 1 ? '1 viaje' : `${puntoMostrar.cantidadViajes} viajes`;
  const pasoEtiqueta = serieTemporal.length <= 12 ? 1 : Math.ceil(serieTemporal.length / 8);

  return (
    <Card className="reporte-grafico-card" role="region" aria-label="Actividad del período">
      <div className="reporte-grafico-header">
        <div>
          <h2>Actividad del período</h2>
          <p className="reporte-actividad-detalle num">
            {`${prefijoDetalle}${tituloPuntoSerie(puntoMostrar, granularidadTemporal)} · ${formatearKm(puntoMostrar.kmRecorridos)} km · ${viajesDetalle}`}
          </p>
        </div>
        <ControlSegmentado
          opciones={OPCIONES_ACTIVIDAD}
          valor={metrica}
          onChange={setMetrica}
          ariaLabel="Métrica del gráfico de actividad"
        />
      </div>

      <div className="reporte-actividad-cuerpo">
        <div className="reporte-eje-y num" aria-hidden="true">
          {marcas.map((valorMarca) => (
            <span
              key={valorMarca}
              className="reporte-eje-y-etiqueta"
              style={{ top: `${((techo - valorMarca) / techo) * 100}%` }}
            >
              {formatearKm(valorMarca)}
            </span>
          ))}
        </div>

        <div className="reporte-columnas-scroll">
          <div className="reporte-columnas-area">
            <div className="reporte-guias" aria-hidden="true">
              {marcas.map((valorMarca) => (
                <span
                  key={valorMarca}
                  className={`reporte-guia-linea${valorMarca === 0 ? ' is-base' : ''}`}
                  style={{ top: `${((techo - valorMarca) / techo) * 100}%` }}
                />
              ))}
            </div>

            <div className="reporte-columnas">
              {serieTemporal.map((punto, idx) => {
                const valor = valorDe(punto);
                const altura = valor > 0 ? Math.max(4, Math.round((valor / techo) * 1000) / 10) : 0;
                const mostrarEtiqueta = idx % pasoEtiqueta === 0 || idx === serieTemporal.length - 1;
                const activa = puntoSeleccionado?.clave === punto.clave;
                const etiquetaViajes = punto.cantidadViajes === 1 ? '1 viaje' : `${punto.cantidadViajes} viajes`;

                return (
                  <button
                    key={punto.clave}
                    type="button"
                    className={`reporte-columna-btn${activa ? ' is-activa' : ''}`}
                    aria-label={`${tituloPuntoSerie(punto, granularidadTemporal)}: ${formatearKm(punto.kmRecorridos)} km, ${etiquetaViajes}`}
                    aria-pressed={activa}
                    onClick={() => setClaveSeleccionada((prev) => (prev === punto.clave ? null : punto.clave))}
                    onFocus={() => setClaveSeleccionada(punto.clave)}
                    onMouseEnter={() => {
                      if (hayHover()) setClaveSeleccionada(punto.clave);
                    }}
                  >
                    <span className="reporte-columna-zona" aria-hidden="true">
                      <span
                        className={`reporte-columna-barra${valor === 0 ? ' is-cero' : ''}`}
                        style={valor > 0 ? { height: `${altura}%` } : undefined}
                      />
                    </span>
                    <span className="reporte-columna-etiqueta">
                      {mostrarEtiqueta ? etiquetaPuntoSerie(punto, granularidadTemporal, serieTemporal.length) : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function GraficosReporte({ reporte }) {
  if (!reporte || reporte.totales?.cantidadViajes === 0) return null;

  return (
    <section className="reporte-graficos" aria-label="Gráficos del reporte">
      <div className="reporte-graficos-fila">
        <GraficoPorTipoVehiculo porTipoVehiculo={reporte.porTipoVehiculo} />
        <GraficoActividadPeriodo
          serieTemporal={reporte.serieTemporal}
          granularidadTemporal={reporte.granularidadTemporal}
        />
      </div>
    </section>
  );
}

export default GraficosReporte;
