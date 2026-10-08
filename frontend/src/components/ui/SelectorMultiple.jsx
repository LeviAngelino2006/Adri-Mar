import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './SelectorMultiple.css';

// Sin tildes ni mayúsculas, para que "perez" encuentre "Pérez".
function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const ICONO_QUITAR = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

// Selector de varias opciones con chips. Es genérico: no sabe de choferes ni de
// vehículos, quien lo usa le pasa las opciones ya con su etiqueta.
//
// Es CONTROLADO: no guarda la selección, `valor` es la lista de ids elegidos y
// `onChange(ids)` recibe la lista nueva completa (el orden de elección se
// conserva). Un id de `valor` que no esté en `opciones` (p. ej. mientras cargan
// las opciones) no se descarta: se muestra como "#id" para no perder datos sin
// que se note.
//
// `avisos` ({ [id]: texto }) muestra un aviso debajo del chip de ese id y le
// da tono de advertencia. Es informativo: el componente nunca bloquea nada.
function SelectorMultiple({
  id,
  opciones,
  valor,
  onChange,
  avisos = {},
  placeholder = 'Agregar…',
  disabled = false,
  ...resto
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const contenedorRef = useRef(null);
  const listaId = useId();

  const opcionPorId = useMemo(() => new Map(opciones.map((o) => [o.id, o])), [opciones]);

  const disponibles = useMemo(() => {
    const buscado = normalizar(texto.trim());
    return opciones.filter((o) => !valor.includes(o.id) && normalizar(o.etiqueta).includes(buscado));
  }, [opciones, valor, texto]);

  // Si la lista filtrada se achica, el activo no puede quedar fuera de rango.
  const indiceActivo = Math.min(activo, Math.max(disponibles.length - 1, 0));

  useEffect(() => {
    function alHacerClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', alHacerClickFuera);
    return () => document.removeEventListener('mousedown', alHacerClickFuera);
  }, []);

  function agregar(opcion) {
    onChange([...valor, opcion.id]);
    setTexto('');
    setActivo(0);
    setAbierto(false);
  }

  function quitar(idQuitado) {
    onChange(valor.filter((v) => v !== idQuitado));
  }

  function handleChangeTexto(e) {
    setTexto(e.target.value);
    setActivo(0);
    setAbierto(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
      } else {
        setActivo(Math.min(indiceActivo + 1, disponibles.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(Math.max(indiceActivo - 1, 0));
    } else if (e.key === 'Enter' && abierto) {
      // Con la lista abierta Enter elige la opción activa; nunca envía el
      // formulario por accidente.
      e.preventDefault();
      if (disponibles[indiceActivo]) agregar(disponibles[indiceActivo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  }

  const hayOpciones = opciones.length > 0;
  const todasElegidas = hayOpciones && disponibles.length === 0 && texto.trim() === '';

  return (
    <div className="selector-multiple" ref={contenedorRef}>
      {valor.length > 0 && (
        <ul className="selector-multiple-chips">
          {valor.map((valorId) => {
            const etiqueta = opcionPorId.get(valorId)?.etiqueta ?? `#${valorId}`;
            const aviso = avisos[valorId];
            return (
              <li key={valorId} className="selector-multiple-item">
                <span className={aviso ? 'selector-multiple-chip selector-multiple-chip-aviso' : 'selector-multiple-chip'}>
                  <span>{etiqueta}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className="selector-multiple-quitar"
                      aria-label={`Quitar ${etiqueta}`}
                      onClick={() => quitar(valorId)}
                    >
                      {ICONO_QUITAR}
                    </button>
                  )}
                </span>
                {aviso && <p className="selector-multiple-aviso">{aviso}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto && !disabled}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={abierto && disponibles[indiceActivo] ? `${listaId}-${disponibles[indiceActivo].id}` : undefined}
        value={texto}
        onChange={handleChangeTexto}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        {...resto}
      />

      {abierto && !disabled && (
        <ul className="selector-multiple-lista" id={listaId} role="listbox" aria-multiselectable="true">
          {disponibles.map((opcion, indice) => (
            <li
              key={opcion.id}
              id={`${listaId}-${opcion.id}`}
              role="option"
              aria-selected="false"
              className={indice === indiceActivo ? 'selector-multiple-opcion selector-multiple-opcion-activa' : 'selector-multiple-opcion'}
              // mousedown (y no click) para que el input no pierda el foco antes
              // de elegir.
              onMouseDown={(e) => {
                e.preventDefault();
                agregar(opcion);
              }}
              onMouseEnter={() => setActivo(indice)}
            >
              {opcion.etiqueta}
            </li>
          ))}

          {disponibles.length === 0 && (
            <li className="selector-multiple-estado" role="presentation">
              {!hayOpciones && 'No hay opciones para elegir'}
              {todasElegidas && 'Ya elegiste todas las opciones'}
              {hayOpciones && !todasElegidas && 'Sin coincidencias'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default SelectorMultiple;
