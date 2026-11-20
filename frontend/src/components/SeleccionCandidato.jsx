import FormField from './ui/FormField';
import OpcionVacia from './ui/OpcionVacia';
import { TEXTO_VERIFICANDO, habilitadosPrimero } from '../utils/tarjetasCandidatos';
import './SeleccionCandidato.css';

const OPCION_OTRO = 'otro';

// Elección de UNA persona o vehículo al confirmar un viaje. Se usa dos veces en
// ModalConfirmarViaje (chofer y vehículo).
//
//  - Con candidatos: un radio por cada uno, en fila. Los disponibles van
//    primero y los no disponibles al final, deshabilitados y con su motivo a la
//    derecha (dentro de cada grupo, en el orden en que vienen). Al final está
//    "Elegir otro…", que despliega un select con el resto de los elegibles.
//  - Sin candidatos: directamente el select.
//
// `estados` ({ [id]: { disponible, motivo } }) viene de la disponibilidad. Los
// no disponibles del select también van deshabilitados, con el motivo en la
// etiqueta: no se pueden elegir.
//
// `verificando`: la disponibilidad todavía no llegó (o la consulta falló y hay
// que reintentar). Mientras tanto no se puede elegir nada: cada radio queda
// deshabilitado con "Verificando…" a la derecha y el select, deshabilitado.
// Quien lo usa deshabilita también el botón de confirmar.
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
        <OpcionVacia obligatorio>{verificando ? TEXTO_VERIFICANDO : placeholder}</OpcionVacia>
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

  // Mientras se verifica no se sabe quién está disponible: el orden en que vienen.
  const ordenados = verificando ? candidatos : habilitadosPrimero(candidatos, noDisponible);

  // Una fila de radio: deshabilitada (por la disponibilidad o mientras se
  // verifica) con el texto de la derecha.
  const fila = ({ clave, value, texto, deshabilitado, aDerecha, onElegir }) => (
    <label
      key={clave}
      className={deshabilitado ? 'seleccion-candidato-opcion seleccion-candidato-opcion-deshabilitada' : 'seleccion-candidato-opcion'}
    >
      <input
        type="radio"
        name={id}
        value={value}
        checked={valor.opcion === String(value)}
        disabled={deshabilitado}
        onChange={onElegir}
      />
      <span className="seleccion-candidato-nombre">{texto}</span>
      {aDerecha && (
        <span className={verificando ? 'seleccion-candidato-motivo seleccion-candidato-verificando' : 'seleccion-candidato-motivo'}>
          {aDerecha}
        </span>
      )}
    </label>
  );

  return (
    <fieldset
      className="seleccion-candidato"
      aria-describedby={error ? `${id}-error` : undefined}
      aria-busy={verificando || undefined}
    >
      <legend>{etiqueta}</legend>

      {ordenados.map((c) => {
        const deshabilitado = verificando || noDisponible(c);
        let aDerecha = null;
        if (verificando) aDerecha = TEXTO_VERIFICANDO;
        else if (deshabilitado) aDerecha = motivoDe(c);
        return fila({
          clave: c.id,
          value: c.id,
          texto: c.etiqueta,
          deshabilitado,
          aDerecha,
          onElegir: () => onChange({ opcion: String(c.id), otroId: '' }),
        });
      })}

      {fila({
        clave: OPCION_OTRO,
        value: OPCION_OTRO,
        texto: 'Elegir otro…',
        deshabilitado: verificando,
        aDerecha: verificando ? TEXTO_VERIFICANDO : null,
        onElegir: () => onChange({ opcion: OPCION_OTRO, otroId: valor.otroId }),
      })}

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
