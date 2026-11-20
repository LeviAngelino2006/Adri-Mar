import FormField from './ui/FormField';
import OpcionVacia from './ui/OpcionVacia';
import TarjetaSeleccionable from './ui/TarjetaSeleccionable';
import { estadoHabilitacion } from '../utils/tarjetasCandidatos';
import './SeleccionCandidato.css';

const OPCION_OTRO = 'otro';

// Elección de UNA persona o vehículo al confirmar un viaje. Se usa dos veces en
// ModalConfirmarViaje (chofer y vehículo).
//
//  - Con candidatos: una tarjeta con radio (TarjetaSeleccionable) por cada uno.
//    Los no disponibles van deshabilitados y con su motivo, y al final está la
//    tarjeta "Elegir otro…", que despliega un select con el resto de los
//    elegibles.
//  - Sin candidatos: directamente el select.
//
// `candidatos`: [{ id, titulo, detalles?, etiqueta }] (ver utils/tarjetasCandidatos;
// `etiqueta` es el texto corto). `estados` ({ [id]: { disponible, motivo } })
// viene de la disponibilidad; es null mientras se consulta o si la consulta
// falló, y en ese caso todo queda habilitado (el backend valida igual al
// confirmar) y la tarjeta no dice nada de su estado. Los no disponibles del
// select también van deshabilitados, con el motivo en la etiqueta: no se pueden
// elegir.
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
  // Solo se muestra el estado si se sabe (la disponibilidad ya llegó, o el item
  // trae el suyo).
  const estadoConocido = (item) => {
    const estado = estadoDe(item?.id);
    return (estado !== undefined && estado !== null) || item?.disponible !== undefined;
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

      <div className="tarjetas-seleccionables">
        {candidatos.map((c) => {
          const deshabilitado = noDisponible(c);
          return (
            <TarjetaSeleccionable
              key={c.id}
              tipo="radio"
              name={id}
              value={c.id}
              titulo={c.titulo ?? c.etiqueta}
              detalles={c.detalles}
              estado={estadoConocido(c) ? estadoHabilitacion({ disponible: !deshabilitado, motivo: motivoDe(c) }) : undefined}
              seleccionada={valor.opcion === String(c.id)}
              deshabilitada={deshabilitado}
              onChange={() => onChange({ opcion: String(c.id), otroId: '' })}
            />
          );
        })}

        <TarjetaSeleccionable
          tipo="radio"
          name={id}
          value={OPCION_OTRO}
          titulo="Elegir otro…"
          detalles={['Del resto de la lista']}
          seleccionada={valor.opcion === OPCION_OTRO}
          onChange={() => onChange({ opcion: OPCION_OTRO, otroId: valor.otroId })}
        />
      </div>

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
