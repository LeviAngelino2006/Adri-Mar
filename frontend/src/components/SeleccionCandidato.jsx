import FormField from './ui/FormField';
import OpcionVacia from './ui/OpcionVacia';
import TarjetaSeleccionable from './ui/TarjetaSeleccionable';
import { ESTADO_VERIFICANDO, estadoHabilitacion } from '../utils/tarjetasCandidatos';
import './SeleccionCandidato.css';

const OPCION_OTRO = 'otro';

// Elección de UNA persona o vehículo al confirmar un viaje. Se usa dos veces en
// ModalConfirmarViaje (chofer y vehículo).
//
//  - Con candidatos: una tarjeta con radio (TarjetaSeleccionable) por cada uno.
//    Las no disponibles van deshabilitadas y con su motivo. Después está la
//    tarjeta "Elegir otro…", que despliega un select con el resto de los
//    elegibles.
//  - Sin candidatos: directamente el select.
//
// `candidatos`: [{ id, titulo, detalles?, etiqueta }] (ver utils/tarjetasCandidatos;
// `etiqueta` es el texto corto). `estados` ({ [id]: { disponible, motivo } })
// viene de la disponibilidad. Los no disponibles del select también van
// deshabilitados, con el motivo en la etiqueta: no se pueden elegir.
//
// `verificando`: la disponibilidad todavía no llegó (o la consulta falló y hay
// que reintentar). Mientras tanto no se puede elegir nada: cada tarjeta dice
// "Verificando…" y el select queda deshabilitado. Quien lo usa deshabilita
// también el botón de confirmar.
//
// `placeholder` es la primera opción del select ("Elegí el chofer"): no se
// puede elegir, porque confirmar exige uno (ver OpcionVacia).
//
// `valor` es { opcion, otroId }: `opcion` es el id del candidato elegido
// (string, por ser el value de un radio) o 'otro'.
function SeleccionCandidato({
  id,
  etiqueta,
  placeholder,
  candidatos,
  otros,
  estados,
  verificando = false,
  valor,
  onChange,
  error,
}) {
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
      <select
        value={valor.otroId}
        disabled={verificando}
        onChange={(e) => onChange({ opcion: OPCION_OTRO, otroId: e.target.value })}
      >
        <OpcionVacia obligatorio>{verificando ? ESTADO_VERIFICANDO.texto : placeholder}</OpcionVacia>
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
    <fieldset className="seleccion-candidato" aria-describedby={error ? `${id}-error` : undefined} aria-busy={verificando || undefined}>
      <legend>{etiqueta}</legend>

      <div className="tarjetas-seleccionables">
        {candidatos.map((c) => {
          const deshabilitado = verificando || noDisponible(c);
          let estado = ESTADO_VERIFICANDO;
          if (!verificando) estado = estadoHabilitacion({ disponible: !noDisponible(c), motivo: motivoDe(c) });
          return (
            <TarjetaSeleccionable
              key={c.id}
              tipo="radio"
              name={id}
              value={c.id}
              titulo={c.titulo ?? c.etiqueta}
              detalles={c.detalles}
              estado={estado}
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
          estado={verificando ? ESTADO_VERIFICANDO : undefined}
          seleccionada={valor.opcion === OPCION_OTRO}
          deshabilitada={verificando}
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
