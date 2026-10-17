import { useId, useState } from 'react';
import ConfirmModal from './ui/ConfirmModal';
import ControlSegmentado from './ui/ControlSegmentado';
import FormField from './ui/FormField';
import Button from './ui/Button';
import Alert from './ui/Alert';
import { buscarEnMapa } from '../services/ubicacionesApi';
import { parsearCoordenadas, urlPuntoGoogleMaps } from '../utils/coordenadas';
import './PasoUbicarEnMapa.css';

const ICONO_PIN = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

const MODOS = [
  { valor: 'buscar', etiqueta: 'Nombre' },
  { valor: 'pegar', etiqueta: 'Coordenadas' },
];

// Mensaje para el usuario a partir del error de axios del backend.
function mensajeDeError(err, porDefecto) {
  const datos = err?.response?.data;
  return datos?.errores?.coordenadas || datos?.errores?.texto || datos?.errores?.nombre || datos?.error || porDefecto;
}

// Paso para elegir dónde queda una ubicación en el mapa, de una de dos formas:
//  - Buscar: el texto va al backend (GET /ubicaciones/buscar-en-mapa, que
//    consulta OpenRouteService) y el usuario elige uno de hasta 5 candidatos.
//  - Pegar las coordenadas copiadas de Google Maps ("-31.4201, -64.1888").
// El nombre de la ubicación no cambia: el candidato solo aporta el punto.
//
// Se usa al crear una ubicación (SelectorUbicacion) y para completar una
// existente sin coordenadas (desde el error de "Calcular km").
//
//  - nombre: el de la ubicación (título y texto inicial de la búsqueda).
//  - textoConfirmar: "Crear ubicación" o "Guardar ubicación".
//  - onConfirmar({ latitud, longitud }): guarda; si la promesa falla, el error
//    del backend se muestra acá y el paso sigue abierto.
//  - onCancelar.
function PasoUbicarEnMapa({ nombre, textoConfirmar, onConfirmar, onCancelar }) {
  const id = useId();
  const [modo, setModo] = useState('buscar');
  const [texto, setTexto] = useState(nombre);
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState(null);
  const [pegado, setPegado] = useState('');
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const coordenadasPegadas = parsearCoordenadas(pegado);
  const punto =
    modo === 'buscar'
      ? elegido !== null && candidatos?.[elegido]
      : coordenadasPegadas.latitud !== undefined && coordenadasPegadas;

  async function buscar() {
    if (buscando) return;
    setBuscando(true);
    setErrorBusqueda(null);
    // Un "Elegí uno…" de antes no puede quedar colgado: con un solo candidato se
    // elige solo y el radio ya marcado no vuelve a disparar onChange.
    setErrorGeneral(null);
    setElegido(null);
    try {
      const { data } = await buscarEnMapa(texto);
      setCandidatos(data.candidatos);
      if (data.candidatos.length === 1) setElegido(0);
    } catch (err) {
      setCandidatos(null);
      setErrorBusqueda(mensajeDeError(err, 'No se pudo buscar en el mapa. Probá pegando las coordenadas.'));
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar() {
    if (guardando) return;
    if (!punto) {
      setErrorGeneral(
        modo === 'buscar' ? 'Elegí uno de los lugares encontrados.' : coordenadasPegadas.error || 'Pegá las coordenadas del lugar.'
      );
      return;
    }
    setErrorGeneral(null);
    setGuardando(true);
    try {
      await onConfirmar({ latitud: punto.latitud, longitud: punto.longitud });
    } catch (err) {
      setErrorGeneral(mensajeDeError(err, 'No se pudo guardar la ubicación.'));
      setGuardando(false);
    }
  }

  // Enter adentro del paso no tiene que enviar el formulario de atrás (el
  // modal se renderiza dentro del <form> del viaje o del presupuesto).
  const alApretarEnter = (accion) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      accion();
    }
  };

  return (
    <ConfirmModal
      open
      tone="brand"
      size="wide"
      icon={ICONO_PIN}
      title={`Ubicar "${nombre}" en el mapa`}
      description={
        <div className="ubicar-mapa">
          <ControlSegmentado
            opciones={MODOS}
            valor={modo}
            onChange={(m) => {
              setModo(m);
              setErrorGeneral(null);
            }}
            ariaLabel="Ubicar por"
          />

          {modo === 'buscar' ? (
            <>
              <div className="ubicar-mapa-busqueda">
                <FormField id={`${id}-texto`} label="Buscar en el mapa" error={errorBusqueda}>
                  <input
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={alApretarEnter(buscar)}
                    autoComplete="off"
                  />
                </FormField>
                <Button variant="secondary" className="ubicar-mapa-boton-buscar" onClick={buscar} loading={buscando}>
                  Buscar
                </Button>
              </div>

              {candidatos?.length === 0 && (
                <p className="ubicar-mapa-nota">No se encontró nada. Probá con otro texto o pegá las coordenadas.</p>
              )}
              {candidatos?.length > 0 && (
                <ul className="ubicar-mapa-candidatos" role="radiogroup" aria-label="Lugares encontrados">
                  {candidatos.map((c, indice) => (
                    <li key={`${c.latitud},${c.longitud},${indice}`}>
                      <label className={indice === elegido ? 'ubicar-mapa-candidato is-elegido' : 'ubicar-mapa-candidato'}>
                        <input
                          type="radio"
                          name={`${id}-candidato`}
                          checked={indice === elegido}
                          onChange={() => {
                            setElegido(indice);
                            setErrorGeneral(null);
                          }}
                        />
                        <span>{c.etiqueta}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <FormField
              id={`${id}-coordenadas`}
              label="Coordenadas de Google Maps"
              hint="En Google Maps: click derecho sobre el lugar y elegí las coordenadas (la primera opción del menú) para copiarlas."
              error={coordenadasPegadas.error}
            >
              <input
                type="text"
                inputMode="decimal"
                placeholder="-31.4201, -64.1888"
                value={pegado}
                onChange={(e) => {
                  setPegado(e.target.value);
                  setErrorGeneral(null);
                }}
                onKeyDown={alApretarEnter(confirmar)}
                autoComplete="off"
              />
            </FormField>
          )}

          {punto && (
            <p className="ubicar-mapa-nota">
              Punto: <span className="num">{punto.latitud.toFixed(5)}, {punto.longitud.toFixed(5)}</span> ·{' '}
              <a href={urlPuntoGoogleMaps(punto)} target="_blank" rel="noreferrer">
                Ver en Google Maps
              </a>
            </p>
          )}

          {errorGeneral && <Alert variant="error">{errorGeneral}</Alert>}
        </div>
      }
      confirmLabel={guardando ? 'Guardando…' : textoConfirmar}
      onConfirm={confirmar}
      onCancel={onCancelar}
    />
  );
}

export default PasoUbicarEnMapa;
