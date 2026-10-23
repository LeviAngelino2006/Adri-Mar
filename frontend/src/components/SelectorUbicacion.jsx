import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { crearDesdeGoogle } from '../services/ubicacionesApi';
import {
  debeBuscarEnGoogle,
  debeConsultarGoogle,
  frecuenteExistenteDe,
  mensajeErrorGoogle,
  ofrecerCrearPorNombre,
} from '../utils/sugerenciasGoogle';
import useSugerenciasGoogle from './useSugerenciasGoogle';
import useTextoDeSeleccion from './ui/useTextoDeSeleccion';
import { abrirAlEnfocar } from '../utils/focoSinAbrir';
import './ui/SelectorBuscarOCrear.css';
import './SelectorUbicacion.css';

const DEMORA_FRECUENTES_MS = 300;

// Selector de ubicaciones (origen, destino y paradas de un viaje; origen y
// destino de un presupuesto). Al escribir muestra dos grupos:
//
//   Frecuentes               ← las de la base (GET /ubicaciones), como siempre
//   Direcciones (Google)     ← sugerencias de Google Maps
//     [ ] Guardar como frecuente
//
// A Google se le pregunta solo cuando hace falta (cada pregunta se cobra):
// si no hay frecuentes que coincidan con lo escrito, o si el usuario toca
// "Buscar dirección en Google" (ver debeConsultarGoogle). Elegir una frecuente
// nunca llama a Google.
//
// Elegir una dirección de Google la crea (o la reusa, si ese lugar ya estaba)
// con POST /ubicaciones/desde-google: por defecto como PARTICULAR (la casa de
// un pasajero, que no aparece en Frecuentes). Con el check, primero se pide el
// nombre de la FRECUENTE (precargado con el texto principal de la sugerencia y
// editable); si ese nombre ya es otra frecuente, se ofrece usarla. Cada
// búsqueda usa un sessionToken propio que se renueva después de elegir.
//
// Plan B: si Google no está disponible (sin key, tope diario, caído), se
// ofrece "+ Crear «X»" por nombre (una frecuente sin lugar en el mapa, que
// después se ubica con "Ubicarla").
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
  // Muestra el nombre de la selección cuando cambia desde afuera, sin borrar lo
  // que el usuario escribe encima (ver useTextoDeSeleccion).
  const [texto, setTexto] = useTextoDeSeleccion(valor, valorNombre);
  const [abierto, setAbierto] = useState(false);
  const [frecuentes, setFrecuentes] = useState([]);
  // Para qué texto es la lista de frecuentes que se está mostrando.
  const [textoFrecuentes, setTextoFrecuentes] = useState(null);
  const [buscandoFrecuentes, setBuscandoFrecuentes] = useState(false);
  // El usuario tocó "Buscar dirección en Google" (dura hasta elegir o cerrar).
  const [forzarGoogle, setForzarGoogle] = useState(false);
  const [guardarFrecuente, setGuardarFrecuente] = useState(false);
  // Sugerencia elegida con "Guardar como frecuente", esperando el nombre:
  // { sugerencia, nombre }.
  const [nombrando, setNombrando] = useState(null);
  const [eligiendo, setEligiendo] = useState(null);
  // { mensaje, frecuenteExistente? } del último intento de elegir o crear.
  const [errorEleccion, setErrorEleccion] = useState(null);
  const contenedorRef = useRef(null);

  const consultarGoogle =
    abierto &&
    !disabled &&
    debeConsultarGoogle({ texto, forzado: forzarGoogle, textoFrecuentes, buscandoFrecuentes, cantidadFrecuentes: frecuentes.length });
  const google = useSugerenciasGoogle(texto, consultarGoogle);

  useEffect(() => {
    if (!abierto) return undefined;
    let vigente = true;
    const temporizador = setTimeout(() => {
      setBuscandoFrecuentes(true);
      api
        .get('/ubicaciones', { params: { busqueda: texto } })
        .then(({ data }) => vigente && setFrecuentes(data.ubicaciones))
        .catch(() => vigente && setFrecuentes([]))
        .finally(() => {
          if (!vigente) return;
          setTextoFrecuentes(texto);
          setBuscandoFrecuentes(false);
        });
    }, DEMORA_FRECUENTES_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [texto, abierto]);

  function cerrar() {
    setAbierto(false);
    setForzarGoogle(false);
    setNombrando(null);
  }

  useEffect(() => {
    function alHacerClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
        setForzarGoogle(false);
        setNombrando(null);
      }
    }
    document.addEventListener('mousedown', alHacerClickFuera);
    return () => document.removeEventListener('mousedown', alHacerClickFuera);
  }, []);

  function handleChangeTexto(e) {
    setTexto(e.target.value);
    setAbierto(true);
    setErrorEleccion(null);
    setNombrando(null);
    // Escribir invalida la selección vigente hasta que se elija de nuevo: nunca
    // queda un id "pegado" a un texto distinto.
    if (valor) onSeleccionar(null);
  }

  function elegir(ubicacion) {
    setTexto(ubicacion.nombre);
    setGuardarFrecuente(false);
    setErrorEleccion(null);
    cerrar();
    onSeleccionar(ubicacion);
  }

  async function crearDeGoogle(sugerencia, { frecuente, nombre }) {
    if (eligiendo) return;
    setEligiendo(sugerencia.placeId);
    setErrorEleccion(null);
    try {
      const { data } = await crearDesdeGoogle({ placeId: sugerencia.placeId, sessionToken: google.sessionToken, frecuente, nombre });
      elegir(data.ubicacion);
    } catch (err) {
      setErrorEleccion({ mensaje: mensajeErrorGoogle(err), frecuenteExistente: frecuenteExistenteDe(err) });
    } finally {
      // La sesión se cerró con el detalle del lugar (o falló): la próxima
      // búsqueda es otra sesión.
      google.renovarSesion();
      setEligiendo(null);
    }
  }

  function elegirSugerencia(sugerencia) {
    if (guardarFrecuente) {
      setErrorEleccion(null);
      setNombrando({ sugerencia, nombre: sugerencia.textoPrincipal });
      return;
    }
    crearDeGoogle(sugerencia, { frecuente: false, nombre: sugerencia.textoPrincipal });
  }

  function confirmarNombre() {
    const nombre = nombrando.nombre.trim();
    if (!nombre) {
      setErrorEleccion({ mensaje: 'Escribí el nombre de la frecuente.' });
      return;
    }
    crearDeGoogle(nombrando.sugerencia, { frecuente: true, nombre });
  }

  // Plan B: frecuente por nombre, sin lugar en el mapa (POST /ubicaciones).
  async function crearPorNombre() {
    const nombre = texto.trim();
    if (!nombre || eligiendo) return;
    setEligiendo('por-nombre');
    try {
      const { data } = await api.post('/ubicaciones', { nombre });
      elegir(data.ubicacion);
    } catch (err) {
      setErrorEleccion({ mensaje: mensajeErrorGoogle(err) });
    } finally {
      setEligiendo(null);
    }
  }

  const hayTexto = texto.trim().length > 0;
  // Un lugar de Google que ya es una frecuente se muestra una sola vez, en
  // Frecuentes.
  const placeIdsFrecuentes = new Set(frecuentes.map((u) => u.placeId).filter(Boolean));
  const sugerencias = google.sugerencias.filter((s) => !placeIdsFrecuentes.has(s.placeId));
  const mostrarGoogle = consultarGoogle;
  const planB = ofrecerCrearPorNombre({ texto, errorGoogle: mostrarGoogle && google.error, errorEleccion });

  return (
    <div className="selector-buscar-crear selector-ubicacion" ref={contenedorRef}>
      <input
        id={id}
        type="text"
        value={texto}
        onChange={handleChangeTexto}
        onFocus={abrirAlEnfocar(() => setAbierto(true))}
        onClick={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cerrar();
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
          {!debeBuscarEnGoogle(texto) && (
            <li className="selector-buscar-crear-estado">Escribí al menos 3 letras para buscar una dirección o un lugar</li>
          )}
          {debeBuscarEnGoogle(texto) && !mostrarGoogle && (
            <li>
              <button type="button" className="selector-buscar-crear-opcion-nueva" onClick={() => setForzarGoogle(true)}>
                Buscar dirección en Google
              </button>
            </li>
          )}
          {mostrarGoogle && google.cargando && <li className="selector-buscar-crear-estado">Buscando en Google…</li>}
          {mostrarGoogle && !google.cargando && google.error && (
            <li className="selector-buscar-crear-estado selector-ubicacion-error">{google.error}</li>
          )}
          {mostrarGoogle && !google.cargando && !google.error && sugerencias.length === 0 && (
            <li className="selector-buscar-crear-estado">
              {google.sugerencias.length > 0 ? 'Ya está en Frecuentes' : 'Google no encontró esa dirección'}
            </li>
          )}
          {mostrarGoogle && !google.cargando && sugerencias.length > 0 && (
            <>
              <li className="selector-ubicacion-frecuente">
                <label>
                  <input
                    type="checkbox"
                    checked={guardarFrecuente}
                    onChange={(e) => {
                      setGuardarFrecuente(e.target.checked);
                      if (!e.target.checked) setNombrando(null);
                    }}
                  />
                  Guardar como frecuente
                </label>
              </li>
              {sugerencias.map((s) =>
                nombrando?.sugerencia.placeId === s.placeId ? (
                  <li key={s.placeId} className="selector-ubicacion-nombrar">
                    <label htmlFor={`${id}-nombre-frecuente`}>Nombre de la frecuente</label>
                    <input
                      id={`${id}-nombre-frecuente`}
                      type="text"
                      value={nombrando.nombre}
                      autoFocus
                      onChange={(e) => {
                        setNombrando({ ...nombrando, nombre: e.target.value });
                        setErrorEleccion(null);
                      }}
                      onKeyDown={(e) => {
                        // Enter no envía el formulario del viaje; Escape vuelve a la lista.
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmarNombre();
                        }
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setNombrando(null);
                        }
                      }}
                      autoComplete="off"
                    />
                    <span className="selector-ubicacion-secundario">{s.textoSecundario}</span>
                    <div className="selector-ubicacion-nombrar-acciones">
                      <button type="button" className="selector-buscar-crear-opcion-nueva" onClick={confirmarNombre} disabled={Boolean(eligiendo)}>
                        {eligiendo ? 'Guardando…' : 'Guardar frecuente'}
                      </button>
                      <button type="button" onClick={() => setNombrando(null)}>
                        Cancelar
                      </button>
                    </div>
                    {/* El error (ej. nombre repetido) va junto al campo, con la
                        opción de usar la frecuente que ya existe. */}
                    {errorEleccion && (
                      <span className="selector-ubicacion-error" role="alert">
                        {errorEleccion.mensaje}
                      </span>
                    )}
                    {errorEleccion?.frecuenteExistente && (
                      <button
                        type="button"
                        className="selector-buscar-crear-opcion-nueva"
                        onClick={() => elegir(errorEleccion.frecuenteExistente)}
                      >
                        {`Usar "${errorEleccion.frecuenteExistente.nombre}"`}
                      </button>
                    )}
                  </li>
                ) : (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      className="selector-ubicacion-sugerencia"
                      onClick={() => elegirSugerencia(s)}
                      disabled={Boolean(eligiendo)}
                      aria-busy={eligiendo === s.placeId || undefined}
                    >
                      <span className="selector-ubicacion-principal">{s.textoPrincipal}</span>
                      {s.textoSecundario && <span className="selector-ubicacion-secundario">{s.textoSecundario}</span>}
                    </button>
                  </li>
                )
              )}
              {/* Atribución que piden los términos de Google cuando sus datos
                  se muestran sin un mapa de Google. */}
              <li className="selector-ubicacion-atribucion" role="presentation">
                Google Maps
              </li>
            </>
          )}

          {errorEleccion && !nombrando && (
            <li className="selector-buscar-crear-estado selector-ubicacion-error" role="alert">
              {errorEleccion.mensaje}
            </li>
          )}
          {errorEleccion?.frecuenteExistente && !nombrando && (
            <li>
              <button type="button" className="selector-buscar-crear-opcion-nueva" onClick={() => elegir(errorEleccion.frecuenteExistente)}>
                {`Usar "${errorEleccion.frecuenteExistente.nombre}"`}
              </button>
            </li>
          )}
          {planB && (
            <li>
              <button type="button" className="selector-buscar-crear-opcion-nueva" onClick={crearPorNombre} disabled={Boolean(eligiendo)}>
                {eligiendo === 'por-nombre' ? 'Creando…' : `+ Crear "${texto.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default SelectorUbicacion;
