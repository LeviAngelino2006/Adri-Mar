import FormField from './ui/FormField';
import OpcionVacia from './ui/OpcionVacia';
import './SeleccionCandidato.css';

const OPCION_OTRO = 'otro';

// Elección de UNA persona o vehículo al confirmar un viaje. Se usa dos veces en
// ModalConfirmarViaje (chofer y vehículo).
//
//  - Con candidatos: un radio por cada uno. Los no disponibles van
//    deshabilitados y con su motivo a la derecha, y al final está "Elegir
//    otro…", que despliega un select con el resto de los elegibles.
//  - Sin candidatos: directamente el select.
//
// `estados` ({ [id]: { disponible, motivo } }) viene de la disponibilidad; es
// null mientras se consulta o si la consulta falló, y en ese caso todo queda
// habilitado (el backend valida igual al confirmar). Los no disponibles del
// select también van deshabilitados, con el motivo en la etiqueta: no se
// pueden elegir.
//
// `placeholder` es la primera opción del select ("Elegí el chofer"): no se
// puede elegir, porque confirmar exige uno (ver OpcionVacia).
//
// `valor` es { opcion, otroId }: `opcion` es el id del candidato elegido
// (string, por ser el value de un radio) o 'otro'.
function SeleccionCandidato({ id, etiqueta, placeholder, candidatos, otros, estados, valor, onChange, error }) {
  const estadoDe = (itemId) => estados?.[itemId];
  const motivoDe = (item) => estadoDe(item?.id)?.motivo || item?.motivo;
  const noDisponible = (item) => {
    const estado = estadoDe(item?.id);
    if (estado !== undefined && estado !== null) return estado.disponible === false;
    return item?.disponible === false;
  };

  const hayCandidatos = candidatos.length > 0;
  const mostrarSelect = !hayCandidatos || valor.opcion === OPCION_OTRO;

  const select = (
    <FormField id={`${id}-otro`} label={hayCandidatos ? `${etiqueta} (otro)` : etiqueta} error={hayCandidatos ? undefined : error}>
      <select value={valor.otroId} onChange={(e) => onChange({ opcion: OPCION_OTRO, otroId: e.target.value })}>
        <OpcionVacia obligatorio>{placeholder}</OpcionVacia>
        {otros.map((o) => {
          const deshabilitado = noDisponible(o);
          const motivo = motivoDe(o);
          return (
            <option key={o.id} value={o.id} disabled={deshabilitado}>
              {deshabilitado ? `${o.etiqueta} — ${motivo}` : o.etiqueta}
            </option>
          );
        })}
      </select>
    </FormField>
  );

  if (!hayCandidatos) return select;

  return (
    <fieldset className="seleccion-candidato" aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{etiqueta}</legend>

      {candidatos.map((c) => {
        const deshabilitado = noDisponible(c);
        const motivo = motivoDe(c);
        return (
          <label
            key={c.id}
            className={deshabilitado ? 'seleccion-candidato-opcion seleccion-candidato-opcion-deshabilitada' : 'seleccion-candidato-opcion'}
          >
            <input
              type="radio"
              name={id}
              value={c.id}
              checked={valor.opcion === String(c.id)}
              disabled={deshabilitado}
              onChange={() => onChange({ opcion: String(c.id), otroId: '' })}
            />
            <span className="seleccion-candidato-nombre">{c.etiqueta}</span>
            {deshabilitado && <span className="seleccion-candidato-motivo">{motivo}</span>}
          </label>
        );
      })}

      <label className="seleccion-candidato-opcion">
        <input
          type="radio"
          name={id}
          value={OPCION_OTRO}
          checked={valor.opcion === OPCION_OTRO}
          onChange={() => onChange({ opcion: OPCION_OTRO, otroId: valor.otroId })}
        />
        <span className="seleccion-candidato-nombre">Elegir otro…</span>
      </label>

      {mostrarSelect && select}

      {error && (
        <p id={`${id}-error`} className="form-field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default SeleccionCandidato;
