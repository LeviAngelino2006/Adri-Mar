import './GrupoCasillas.css';

// Varias opciones de una lista corta y fija, todas a la vista: una casilla por
// opción con su detalle debajo. Controlado: `valor` son los ids marcados y
// `onChange` recibe la lista nueva en el orden de `opciones`. Trae su propio
// legend, hint y error (no va dentro de FormField). `contenidoMarcada(opcion)`
// es lo que va debajo de una opción marcada (el "¿Qué trabajo?" de "Otro"),
// dentro de su celda pero fuera del label: un clic ahí no la desmarca. Ver
// docs/design-system/componentes/GrupoCasillas.md.
function GrupoCasillas({
  id,
  legend,
  opciones,
  valor,
  onChange,
  required = false,
  hint,
  error,
  disabled = false,
  contenidoMarcada,
}) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  function alternar(opcionId) {
    const marcados = valor.includes(opcionId) ? valor.filter((v) => v !== opcionId) : [...valor, opcionId];
    onChange(opciones.map((o) => o.id).filter((oid) => marcados.includes(oid)));
  }

  return (
    <fieldset id={id} className="grupo-casillas" aria-describedby={errorId || hintId}>
      <legend className="grupo-casillas-legend">
        {legend}
        {required && (
          <>
            <span className="form-field-required" aria-hidden="true">
              {' *'}
            </span>
            {/* aria-required no vale en un grupo de casillas: se dice en el legend. */}
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </legend>
      <div className="grupo-casillas-opciones">
        {opciones.map((opcion, indice) => {
          const marcada = valor.includes(opcion.id);
          const contenido = marcada ? contenidoMarcada?.(opcion) : null;
          return (
            <div
              key={opcion.id}
              className={`grupo-casillas-celda ${marcada ? 'grupo-casillas-celda-marcada' : ''}`.trim()}
            >
              <label className="grupo-casillas-opcion">
                <input
                  type="checkbox"
                  id={`${id}-${opcion.id}`}
                  checked={marcada}
                  disabled={disabled}
                  onChange={() => alternar(opcion.id)}
                  // En la primera, para que useFocoEnPrimerError lleve el foco al
                  // grupo y el lector de pantalla lea el error al enfocarla.
                  aria-invalid={error && indice === 0 ? true : undefined}
                  aria-describedby={error && indice === 0 ? errorId : undefined}
                />
                <span className="grupo-casillas-texto">
                  <span className="grupo-casillas-etiqueta">{opcion.etiqueta}</span>
                  {opcion.detalle && <span className="grupo-casillas-detalle">{opcion.detalle}</span>}
                </span>
              </label>
              {contenido && <div className="grupo-casillas-contenido">{contenido}</div>}
            </div>
          );
        })}
      </div>
      {hintId && (
        <p id={hintId} className="form-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="form-field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default GrupoCasillas;
