import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { crearDesdeGoogle } from '../services/ubicacionesApi';
import { mensajeErrorGoogle } from '../utils/sugerenciasGoogle';
import useSugerenciasGoogle from './useSugerenciasGoogle';
import './ui/SelectorBuscarOCrear.css';
import './SelectorUbicacion.css';

const DEMORA_FRECUENTES_MS = 300;

// Selector de ubicaciones (origen, destino y paradas de un viaje; origen y
// destino de un presupuesto). Al escribir muestra dos grupos:
//
//   Frecuentes               ← las de la base (GET /ubicaciones), como siempre
//   Direcciones (Google)     ← sugerencias de Google Maps (desde 3 letras)
//     [ ] Guardar como frecuente
//
// Elegir una dirección de Google la crea (o la reusa, si ese lugar ya estaba)
// con POST /ubicaciones/desde-google: por defecto como PARTICULAR (la casa de
// un pasajero, que no aparece en Frecuentes); con el check, como FRECUENTE
// (un colegio, un hotel). Cada búsqueda usa un sessionToken propio que se
// renueva después de elegir (ver useSugerenciasGoogle).
//
// Mismas props que SelectorBuscarOCrear (valor, valorNombre, onSeleccionar…);
// las que agrega FormField (id, aria-*) van al input. onSeleccionar recibe
// { id, nombre, placeId, latitud, longitud } o null.
function SelectorUbicacion({
  id,
  valor,
  valorNombre,
  onSeleccionar,
  placeholder = 'Buscar ubicación o dirección…',
  disabled = false,
  ...resto
}) {
  const [texto, setTexto] = useState(valorNombre || '');
  const [abierto, setAbierto] = useState(false);
  const [frecuentes, setFrecuentes] = useState([]);
  const [buscandoFrecuentes, setBuscandoFrecuentes] = useState(false);
  const [guardarFrecuente, setGuardarFrecuente] = useState(false);
  const [eligiendo, setEligiendo] = useState(null);
  const [errorEleccion, setErrorEleccion] = useState(null);
  const contenedorRef = useRef(null);
  const google = useSugerenciasGoogle(texto, abierto && !disabled);

  // Si la selección cambia desde afuera (ej. el formulario carga un viaje para
  // editar), se muestra su nombre. Cuando el formulario la vacía porque el
  // usuario empezó a escribir, el texto NO se toca (si no, se borraría lo que
  // está escribiendo). Se ajusta durante el render, no en un efecto (patrón de
  // React para estado que depende de una prop).
  const seleccion = `${valor ?? ''}|${valorNombre ?? ''}`;
  const [seleccionPrevia, setSeleccionPrevia] = useState(seleccion);
  if (seleccion !== seleccionPrevia) {
    setSeleccionPrevia(seleccion);
    if (valor) setTexto(valorNombre || '');
  }

  useEffect(() => {
    if (!abierto) return undefined;
    const temporizador = setTimeout(() => {
      setBuscandoFrecuentes(true);
      api
        .get('/ubicaciones', { params: { busqueda: texto } })
        .then(({ data }) => setFrecuentes(data.ubicaciones))
        .catch(() => setFrecuentes([]))
        .finally(() => setBuscandoFrecuentes(false));
    }, DEMORA_FRECUENTES_MS);
    return () => clearTimeout(temporizador);
  }, [texto, abierto]);

  useEffect(() => {
    function alHacerClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', alHacerClickFuera);
    return () => document.removeEventListener('mousedown', alHacerClickFuera);
  }, []);

  function handleChangeTexto(e) {
    setTexto(e.target.value);
    setAbierto(true);
    setErrorEleccion(null);
    // Escribir invalida la selección vigente hasta que se elija de nuevo: nunca
    // queda un id "pegado" a un texto distinto.
    if (valor) onSeleccionar(null);
  }

  function elegir(ubicacion) {
    setTexto(ubicacion.nombre);
    setAbierto(false);
    onSeleccionar(ubicacion);
  }

  async function elegirDeGoogle(sugerencia) {
    if (eligiendo) return;
    setEligiendo(sugerencia.placeId);
    setErrorEleccion(null);
    try {
      const { data } = await crearDesdeGoogle({
        placeId: sugerencia.placeId,
        sessionToken: google.sessionToken,
        frecuente: guardarFrecuente,
        nombre: sugerencia.textoPrincipal,
      });
      setGuardarFrecuente(false);
      elegir(data.ubicacion);
    } catch (err) {
      setErrorEleccion(mensajeErrorGoogle(err));
    } finally {
      // La sesión se cerró con el detalle del lugar (o falló): la próxima
      // búsqueda es otra sesión.
      google.renovarSesion();
      setEligiendo(null);
    }
  }

  const hayTexto = texto.trim().length > 0;
  // Un lugar de Google que ya es una frecuente se muestra una sola vez, en
  // Frecuentes.
  const placeIdsFrecuentes = new Set(frecuentes.map((u) => u.placeId).filter(Boolean));
  const sugerencias = google.sugerencias.filter((s) => !placeIdsFrecuentes.has(s.placeId));

  return (
    <div className="selector-buscar-crear selector-ubicacion" ref={contenedorRef}>
      <input
        id={id}
        type="text"
        value={texto}
        onChange={handleChangeTexto}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierto(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        {...resto}
      />

      {abierto && !disabled && (
        <ul className="selector-buscar-crear-lista" role="listbox">
          <li className="selector-ubicacion-grupo" role="presentation">
            Frecuentes
          </li>
          {buscandoFrecuentes && <li className="selector-buscar-crear-estado">Buscando…</li>}
          {!buscandoFrecuentes && frecuentes.length === 0 && (
            <li className="selector-buscar-crear-estado">
              {hayTexto ? 'Ninguna frecuente con ese nombre' : 'Sin resultados todavía'}
            </li>
          )}
          {!buscandoFrecuentes &&
            frecuentes.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => elegir(u)}>
                  {u.nombre}
                </button>
              </li>
            ))}

          <li className="selector-ubicacion-grupo" role="presentation">
            Direcciones (Google)
          </li>
          {!google.hayTexto && (
            <li className="selector-buscar-crear-estado">Escribí al menos 3 letras para buscar una dirección o un lugar</li>
          )}
          {google.hayTexto && google.cargando && <li className="selector-buscar-crear-estado">Buscando en Google…</li>}
          {google.hayTexto && !google.cargando && google.error && (
            <li className="selector-buscar-crear-estado selector-ubicacion-error">{google.error}</li>
          )}
          {google.hayTexto && !google.cargando && !google.error && sugerencias.length === 0 && (
            <li className="selector-buscar-crear-estado">
              {google.sugerencias.length > 0 ? 'Ya está en Frecuentes' : 'Google no encontró esa dirección'}
            </li>
          )}
          {google.hayTexto && !google.cargando && sugerencias.length > 0 && (
            <>
              <li className="selector-ubicacion-frecuente">
                <label>
                  <input
                    type="checkbox"
                    checked={guardarFrecuente}
                    onChange={(e) => setGuardarFrecuente(e.target.checked)}
                  />
                  Guardar como frecuente
                </label>
              </li>
              {sugerencias.map((s) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    className="selector-ubicacion-sugerencia"
                    onClick={() => elegirDeGoogle(s)}
                    disabled={Boolean(eligiendo)}
                    aria-busy={eligiendo === s.placeId || undefined}
                  >
                    <span className="selector-ubicacion-principal">{s.textoPrincipal}</span>
                    {s.textoSecundario && <span className="selector-ubicacion-secundario">{s.textoSecundario}</span>}
                  </button>
                </li>
              ))}
              {/* Atribución que piden los términos de Google cuando sus datos
                  se muestran sin un mapa de Google. */}
              <li className="selector-ubicacion-atribucion" role="presentation">
                Google Maps
              </li>
            </>
          )}
          {errorEleccion && (
            <li className="selector-buscar-crear-estado selector-ubicacion-error" role="alert">
              {errorEleccion}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default SelectorUbicacion;
