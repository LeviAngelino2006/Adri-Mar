import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import {
  RELACION_PAGINA_POR_DEFECTO,
  ZOOM_AJUSTADO,
  ZOOM_MAX,
  ZOOM_MIN,
  cambiarZoom,
  limitarPagina,
  paginaMasVisible,
  paginaPorTecla,
  textoPagina,
} from '../../utils/visorPdf';
import './VisorPdf.css';

// El worker sale del mismo `pdfjs-dist` que trae react-pdf y lo sirve Vite: sin CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// Cuánto esperar al redimensionar antes de volver a calcular el ancho de las
// páginas (cada cambio de ancho vuelve a dibujarlas).
const ESPERA_REDIMENSION_MS = 120;
// Umbrales del observador de página actual: 0, 5%, 10%... 100%.
const UMBRALES = Array.from({ length: 21 }, (_, i) => i / 20);
// Las páginas se dibujan mientras estén a una pantalla o menos del área visible.
const MARGEN_DIBUJO = '100% 0px';

const propsIcono = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const ICONO_ANTERIOR = (
  <svg {...propsIcono}>
    <path d="M18 15l-6-6-6 6" />
  </svg>
);
const ICONO_SIGUIENTE = (
  <svg {...propsIcono}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const ICONO_ALEJAR = (
  <svg {...propsIcono}>
    <path d="M5 12h14" />
  </svg>
);
const ICONO_ACERCAR = (
  <svg {...propsIcono}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const ICONO_AJUSTAR_ANCHO = (
  <svg {...propsIcono}>
    <path d="M4 5v14" />
    <path d="M20 5v14" />
    <path d="M8 12h8" />
    <path d="M10.5 9.5L8 12l2.5 2.5" />
    <path d="M13.5 9.5L16 12l-2.5 2.5" />
  </svg>
);

function BotonBarra({ etiqueta, className = '', children, ...rest }) {
  return (
    <Button variant="ghost" className={`visor-pdf-boton ${className}`.trim()} aria-label={etiqueta} title={etiqueta} {...rest}>
      {children}
    </Button>
  );
}

// Visor del PDF de una versión: barra de controles y todas las páginas una debajo
// de otra, con capa de texto (se puede seleccionar y copiar). Se carga con
// React.lazy desde ModalVisorPdf, así react-pdf y pdf.js no pesan en el resto de
// la app. `onError` avisa que no se pudo leer el PDF. `Document` y `Page` van con
// `suspense={false}`: con el valor por defecto (Suspense) cada página que se monta
// suspendería el Suspense de ModalVisorPdf y ocultaría todo el visor, con lo que se
// pierden el foco y el scroll.
function VisorPdf({ url, titulo, onError }) {
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(ZOOM_AJUSTADO);
  const [anchoBase, setAnchoBase] = useState(0);
  const [relaciones, setRelaciones] = useState({});
  const [dibujadas, setDibujadas] = useState(() => new Set([1]));

  const areaRef = useRef(null);
  const anchoBaseRef = useRef(0);
  const anclaRef = useRef(null);

  const anchoPagina = anchoBase ? Math.round((anchoBase * zoom) / 100) : 0;

  // Guarda qué punto del documento está en el centro del área, para volver a
  // dejarlo ahí cuando cambie el ancho de las páginas (zoom o redimensionado).
  const guardarAncla = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    anclaRef.current = {
      arriba: (area.scrollTop + area.clientHeight / 2) / area.scrollHeight,
      izquierda: (area.scrollLeft + area.clientWidth / 2) / area.scrollWidth,
    };
  }, []);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const ancla = anclaRef.current;
    if (!area || !ancla) return;
    anclaRef.current = null;
    area.scrollTop = ancla.arriba * area.scrollHeight - area.clientHeight / 2;
    area.scrollLeft = ancla.izquierda * area.scrollWidth - area.clientWidth / 2;
  }, [anchoPagina]);

  // "Ajustar al ancho": el ancho útil del área (sin el padding) se recalcula al
  // redimensionar. La primera medición es inmediata; las siguientes esperan un poco.
  useEffect(() => {
    const area = areaRef.current;
    let espera = null;

    function medir() {
      const estilo = getComputedStyle(area);
      const ancho = Math.floor(
        area.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight)
      );
      if (ancho <= 0 || ancho === anchoBaseRef.current) return;
      if (anchoBaseRef.current) guardarAncla();
      anchoBaseRef.current = ancho;
      setAnchoBase(ancho);
    }

    medir();
    const observador = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(medir, ESPERA_REDIMENSION_MS);
    });
    observador.observe(area);
    return () => {
      clearTimeout(espera);
      observador.disconnect();
    };
  }, [guardarAncla]);

  // Con las páginas armadas: un observador decide cuál es la página actual (la que
  // más se ve) y otro cuáles dibujar (las cercanas al área visible).
  useEffect(() => {
    if (!totalPaginas) return;
    const area = areaRef.current;
    const elementos = area.querySelectorAll('[data-pagina]');
    const alturasVisibles = new Map();

    const observadorActual = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          alturasVisibles.set(Number(entrada.target.dataset.pagina), entrada.intersectionRect.height);
        }
        const masVisible = paginaMasVisible(alturasVisibles);
        if (masVisible) setPagina(masVisible);
      },
      { root: area, threshold: UMBRALES }
    );

    const observadorDibujo = new IntersectionObserver(
      (entradas) => {
        setDibujadas((previas) => {
          const siguientes = new Set(previas);
          for (const entrada of entradas) {
            const numero = Number(entrada.target.dataset.pagina);
            if (entrada.isIntersecting) siguientes.add(numero);
            else siguientes.delete(numero);
          }
          const igual = siguientes.size === previas.size && [...siguientes].every((n) => previas.has(n));
          return igual ? previas : siguientes;
        });
      },
      { root: area, rootMargin: MARGEN_DIBUJO }
    );

    elementos.forEach((elemento) => {
      observadorActual.observe(elemento);
      observadorDibujo.observe(elemento);
    });
    return () => {
      observadorActual.disconnect();
      observadorDibujo.disconnect();
    };
  }, [totalPaginas]);

  function enfocarArea() {
    areaRef.current?.focus({ preventScroll: true });
  }

  function irAPagina(numero) {
    const destino = limitarPagina(numero, totalPaginas);
    const area = areaRef.current;
    const elemento = area.querySelector(`[data-pagina="${destino}"]`);
    if (elemento) {
      const margenSuperior = parseFloat(getComputedStyle(area).paddingTop);
      const arriba =
        elemento.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - margenSuperior;
      area.scrollTo({ top: arriba });
    }
    setPagina(destino);
    // Si el botón tocado queda deshabilitado, el foco pasa al área para que sigan
    // andando las flechas.
    if (destino === 1 || destino === totalPaginas) enfocarArea();
  }

  function cambiarNivelZoom(direccion) {
    const nuevo = cambiarZoom(zoom, direccion);
    guardarAncla();
    setZoom(nuevo);
    if (nuevo === ZOOM_MIN || nuevo === ZOOM_MAX) enfocarArea();
  }

  function ajustarAlAncho() {
    guardarAncla();
    setZoom(ZOOM_AJUSTADO);
    enfocarArea();
  }

  function alTeclear(evento) {
    const destino = paginaPorTecla(evento, pagina, totalPaginas);
    if (destino === null) return;
    evento.preventDefault();
    irAPagina(destino);
  }

  function alCargar({ numPages }) {
    setTotalPaginas(numPages);
  }

  function registrarRelacion(numero, { originalWidth, originalHeight }) {
    const relacion = originalHeight / originalWidth;
    setRelaciones((previas) => (previas[numero] === relacion ? previas : { ...previas, [numero]: relacion }));
  }

  // Alto reservado para una página que no está dibujada: así el scroll no salta.
  function altoReservado(numero) {
    return Math.round(anchoPagina * (relaciones[numero] ?? relaciones[1] ?? RELACION_PAGINA_POR_DEFECTO));
  }

  const cargando = (
    <div className="doc-visor-cargando">
      <Spinner size="lg" label="Cargando PDF…" />
    </div>
  );

  return (
    <div className="visor-pdf" onKeyDown={alTeclear}>
      <div className="visor-pdf-barra" role="group" aria-label="Controles del visor de PDF">
        <div className="visor-pdf-grupo">
          <BotonBarra etiqueta="Página anterior" disabled={pagina <= 1} onClick={() => irAPagina(pagina - 1)}>
            {ICONO_ANTERIOR}
          </BotonBarra>
          <span className="visor-pdf-texto">{textoPagina(pagina, totalPaginas)}</span>
          <BotonBarra
            etiqueta="Página siguiente"
            disabled={!totalPaginas || pagina >= totalPaginas}
            onClick={() => irAPagina(pagina + 1)}
          >
            {ICONO_SIGUIENTE}
          </BotonBarra>
        </div>
        <div className="visor-pdf-grupo">
          <BotonBarra
            etiqueta="Alejar"
            className="visor-pdf-zoom"
            disabled={!anchoBase || zoom <= ZOOM_MIN}
            onClick={() => cambiarNivelZoom(-1)}
          >
            {ICONO_ALEJAR}
          </BotonBarra>
          <span className="visor-pdf-texto visor-pdf-zoom" aria-live="polite">
            {zoom}%
          </span>
          <BotonBarra
            etiqueta="Acercar"
            className="visor-pdf-zoom"
            disabled={!anchoBase || zoom >= ZOOM_MAX}
            onClick={() => cambiarNivelZoom(1)}
          >
            {ICONO_ACERCAR}
          </BotonBarra>
          <BotonBarra etiqueta="Ajustar al ancho" disabled={!anchoBase || zoom === ZOOM_AJUSTADO} onClick={ajustarAlAncho}>
            {ICONO_AJUSTAR_ANCHO}
          </BotonBarra>
        </div>
      </div>

      <div className="visor-pdf-area" ref={areaRef} tabIndex={0} role="region" aria-label={`Páginas de ${titulo}`}>
        <Document
          file={url}
          suspense={false}
          loading={cargando}
          error={null}
          noData={null}
          onLoadSuccess={alCargar}
          onLoadError={onError}
          onSourceError={onError}
          onPassword={onError}
        >
          {totalPaginas > 0 && anchoPagina > 0 && (
            <div className="visor-pdf-contenido">
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((numero) => (
                <div
                  key={numero}
                  className="visor-pdf-pagina"
                  data-pagina={numero}
                  style={{ width: anchoPagina, minHeight: altoReservado(numero) }}
                >
                  {dibujadas.has(numero) && (
                    <Page
                      pageNumber={numero}
                      suspense={false}
                      width={anchoPagina}
                      devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                      renderAnnotationLayer={false}
                      loading={<Spinner size="md" label={`Cargando la página ${numero}…`} />}
                      error={<p className="visor-pdf-error-pagina">No se pudo mostrar esta página.</p>}
                      onLoadSuccess={(datos) => registrarRelacion(numero, datos)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Document>
      </div>
    </div>
  );
}

export default VisorPdf;
