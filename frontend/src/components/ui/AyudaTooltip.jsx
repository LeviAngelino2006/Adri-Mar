import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './AyudaTooltip.css';

// Margen mínimo entre el popover y los bordes de la pantalla.
const MARGEN = 8;
// Separación entre el ícono y el popover.
const SEPARACION = 6;

function hayHover() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

// Ícono "?" que muestra un texto de ayuda en un popover: al pasar el mouse
// (solo en dispositivos con hover), al llegar con el teclado y al tocarlo
// (alterna). Se cierra con Escape, tocando afuera, al scrollear (también
// dentro de un modal) y al cambiar el tamaño de la ventana.
//
// El texto vive siempre en un span visually-hidden con `id`: quien lo usa lo
// enlaza con `aria-describedby` del control (FormField lo hace solo), así los
// lectores de pantalla lo leen aunque el popover esté cerrado. El popover es
// solo visual (aria-hidden) para que no se lea dos veces.
function AyudaTooltip({ id, texto }) {
  const idAuto = useId();
  const idTexto = id || `ayuda-${idAuto}`;
  const idPopover = `${idTexto}-popover`;

  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const refContenedor = useRef(null);
  const refBoton = useRef(null);
  const refPopover = useRef(null);
  // Abierto por un toque/clic: no lo cierra el mouse al salir.
  const fijado = useRef(false);
  // El foco llegó por un puntero (no por teclado): lo maneja el clic.
  const focoPorPuntero = useRef(false);
  const temporizadorCierre = useRef(null);

  const cerrar = useCallback(() => {
    fijado.current = false;
    setAbierto(false);
  }, []);

  const ubicar = useCallback(() => {
    const boton = refBoton.current;
    const popover = refPopover.current;
    if (!boton || !popover) return;
    const r = boton.getBoundingClientRect();
    const ancho = popover.offsetWidth;
    const alto = popover.offsetHeight;
    const anchoPantalla = window.innerWidth;
    const altoPantalla = window.innerHeight;
    const izquierdaIdeal = r.left + r.width / 2 - ancho / 2;
    const left = Math.max(MARGEN, Math.min(izquierdaIdeal, anchoPantalla - ancho - MARGEN));
    // Abajo del ícono; si no entra, arriba.
    let top = r.bottom + SEPARACION;
    if (top + alto > altoPantalla - MARGEN && r.top - SEPARACION - alto >= MARGEN) {
      top = r.top - SEPARACION - alto;
    }
    setPosicion({ top, left });
  }, []);

  // Se mide antes de pintar: el popover nunca aparece en la posición vieja.
  useLayoutEffect(() => {
    if (abierto) ubicar();
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return undefined;
    function alTeclear(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar();
      }
    }
    function alTocarAfuera(e) {
      if (refContenedor.current && !refContenedor.current.contains(e.target)) cerrar();
    }
    document.addEventListener('keydown', alTeclear, true);
    document.addEventListener('pointerdown', alTocarAfuera);
    // Al scrollear o cambiar el tamaño de la ventana se cierra: un popover fijo
    // quedaría flotando lejos del ícono. El scroll se escucha en captura para
    // tomar también el del cuerpo de los modales (no burbujea hasta window).
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
    return () => {
      document.removeEventListener('keydown', alTeclear, true);
      document.removeEventListener('pointerdown', alTocarAfuera);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [abierto, cerrar]);

  useEffect(() => () => clearTimeout(temporizadorCierre.current), []);

  function alEntrar(e) {
    if (e.pointerType !== 'mouse' || !hayHover()) return;
    clearTimeout(temporizadorCierre.current);
    setAbierto(true);
  }

  function alSalir(e) {
    if (e.pointerType !== 'mouse' || fijado.current) return;
    // Un respiro para poder pasar del ícono al popover sin que se cierre.
    temporizadorCierre.current = setTimeout(() => {
      if (!fijado.current && refContenedor.current?.contains(document.activeElement) !== true) setAbierto(false);
    }, 120);
  }

  function alClic() {
    // Safari no enfoca el botón al tocarlo: que la marca no quede colgada.
    focoPorPuntero.current = false;
    if (abierto && fijado.current) {
      cerrar();
    } else {
      fijado.current = true;
      setAbierto(true);
    }
  }

  function alEnfocar() {
    if (focoPorPuntero.current) {
      focoPorPuntero.current = false;
      return;
    }
    setAbierto(true);
  }

  return (
    <span
      ref={refContenedor}
      className="ayuda-tooltip"
      onPointerEnter={alEntrar}
      onPointerLeave={alSalir}
    >
      <button
        ref={refBoton}
        type="button"
        className="ayuda-tooltip-boton"
        aria-label="Más información"
        aria-describedby={idTexto}
        aria-expanded={abierto}
        aria-controls={abierto ? idPopover : undefined}
        onPointerDown={() => {
          focoPorPuntero.current = true;
        }}
        onClick={alClic}
        onFocus={alEnfocar}
        onBlur={cerrar}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M6.1 6.2a1.95 1.95 0 0 1 3.8.55c0 1.3-1.9 1.6-1.9 2.75"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span id={idTexto} className="sr-only">
        {texto}
      </span>
      {abierto && (
        <span
          ref={refPopover}
          id={idPopover}
          className="ayuda-tooltip-popover"
          aria-hidden="true"
          style={posicion ? { top: posicion.top, left: posicion.left } : { visibility: 'hidden' }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}

export default AyudaTooltip;
