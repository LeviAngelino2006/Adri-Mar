import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import './SelectorBuscarOCrear.css';

const DEMORA_DEBOUNCE_MS = 300;

// Las respuestas de este tipo de endpoint en el backend siguen todas el
// mismo patrón: una sola clave cuyo nombre es el recurso, en plural para
// listas ({ ubicaciones: [...] }, { clientes: [...] }) y en singular para un
// solo elemento ({ ubicacion: {...} }, { cliente: {...} }). Tomar el primer
// valor del objeto evita tener que parametrizar ese nombre por entidad, y
// permite reusar este componente con cualquier endpoint que respete el
// mismo patrón (como Cliente, a futuro) sin tocarlo.
function extraerDato(data) {
  return Object.values(data)[0];
}

// Selector genérico de "buscar o crear": busca con debounce contra
// `endpoint` (que debe soportar `GET ?busqueda=` y `POST { nombre }`,
// devolviendo en ambos casos `{ id, nombre }` con el patrón de arriba), y
// ofrece crear lo tipeado si no hay coincidencia exacta. No decide por su
// cuenta qué cuenta como "duplicado" — esa decisión es siempre del backend
// (buscarOCrear ya deduplica por nombre normalizado); este componente se
// limita a mostrar la opción de crear y confiar en lo que el backend
// devuelva, nunca a ocultarla o resolverla localmente.
function SelectorBuscarOCrear({
  id,
  endpoint,
  valor,
  valorNombre,
  onSeleccionar,
  placeholder = 'Buscar…',
  disabled = false,
  ...resto
}) {
  const [texto, setTexto] = useState(valorNombre || '');
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const contenedorRef = useRef(null);

  // Si el valor seleccionado cambia desde afuera (ej. el formulario carga un
  // viaje existente para editar), sincronizar el texto mostrado.
  useEffect(() => {
    setTexto(valorNombre || '');
  }, [valor, valorNombre]);

  useEffect(() => {
    if (!abierto) return;

    const temporizador = setTimeout(() => {
      setBuscando(true);
      api
        .get(endpoint, { params: { busqueda: texto } })
        .then(({ data }) => setResultados(extraerDato(data)))
        .finally(() => setBuscando(false));
    }, DEMORA_DEBOUNCE_MS);

    return () => clearTimeout(temporizador);
  }, [texto, abierto, endpoint]);

  useEffect(() => {
    function alHacerClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', alHacerClickFuera);
    return () => document.removeEventListener('mousedown', alHacerClickFuera);
  }, []);

  function handleChangeTexto(e) {
    const nuevoTexto = e.target.value;
    setTexto(nuevoTexto);
    setAbierto(true);
    // Escribir invalida la selección vigente hasta que se elija de nuevo
    // (existente o creada) — nunca queda un id "pegado" a un texto distinto.
    if (valor) onSeleccionar(null);
  }

  function elegirExistente(item) {
    setTexto(item.nombre);
    setAbierto(false);
    onSeleccionar(item);
  }

  async function crear() {
    const nombre = texto.trim();
    if (!nombre || creando) return;

    setCreando(true);
    try {
      const { data } = await api.post(endpoint, { nombre });
      const item = extraerDato(data);
      setTexto(item.nombre);
      setAbierto(false);
      onSeleccionar(item);
    } finally {
      setCreando(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setAbierto(false);
    }
  }

  const hayTexto = texto.trim().length > 0;

  return (
    <div className="selector-buscar-crear" ref={contenedorRef}>
      <input
        id={id}
        type="text"
        value={texto}
        onChange={handleChangeTexto}
        onFocus={() => setAbierto(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        {...resto}
      />

      {abierto && !disabled && (
        <ul className="selector-buscar-crear-lista" role="listbox">
          {buscando && <li className="selector-buscar-crear-estado">Buscando…</li>}

          {!buscando &&
            resultados.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => elegirExistente(item)}>
                  {item.nombre}
                </button>
              </li>
            ))}

          {!buscando && !hayTexto && resultados.length === 0 && (
            <li className="selector-buscar-crear-estado">Sin resultados todavía</li>
          )}

          {!buscando && hayTexto && (
            <li>
              <button type="button" className="selector-buscar-crear-opcion-nueva" onClick={crear} disabled={creando}>
                {creando ? 'Creando…' : `+ Crear "${texto.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default SelectorBuscarOCrear;
