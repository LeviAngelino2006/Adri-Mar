import TarjetaSeleccionable from './TarjetaSeleccionable';

// Grupo de tarjetas con selección MÚLTIPLE (checkboxes), todas a la vista en una
// grilla. Lo usan los choferes y vehículos posibles del alta / edición de un
// viaje. Es genérico: quien lo usa arma cada opción con
// utils/tarjetasCandidatos ({ id, titulo, detalles, estado, deshabilitada }).
//
// Es CONTROLADO y respeta el contrato que tenía SelectorMultiple, para que el
// formulario siga enviando lo mismo: `valor` es la lista de ids elegidos y
// `onChange(ids)` recibe la lista nueva completa, en el orden en que se eligió
// (marcar agrega al final, desmarcar saca). Un id de `valor` que no esté en
// `opciones` (p. ej. mientras cargan) no se descarta: se muestra como "#id",
// elegido, para no perder datos sin que se note.
//
// `avisos` ({ [id]: texto }): aviso informativo en la tarjeta de ese id (p. ej.
// una superposición de horario). Nunca bloquea nada. Si repite el motivo que ya
// dice el estado, no se muestra dos veces.
//
// Trae su propio legend, hint y error (como GrupoCasillas: no va dentro de
// FormField). Con error, la primera tarjeta que se puede tocar lleva
// aria-invalid: así useFocoEnPrimerError lleva el foco al grupo.
function SeleccionTarjetas({ id, legend, opciones, valor, onChange, avisos = {}, hint, error, textoVacio }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  const conocidos = new Set(opciones.map((o) => o.id));
  const tarjetas = [
    ...opciones,
    ...valor.filter((v) => !conocidos.has(v)).map((v) => ({ id: v, titulo: `#${v}`, detalles: [] })),
  ];
  const indiceFoco = error ? tarjetas.findIndex((t) => !t.deshabilitada || valor.includes(t.id)) : -1;

  function alternar(opcionId) {
    onChange(valor.includes(opcionId) ? valor.filter((v) => v !== opcionId) : [...valor, opcionId]);
  }

  return (
    <fieldset id={id} className="seleccion-tarjetas" aria-describedby={errorId || hintId}>
      <legend className="seleccion-tarjetas-legend">{legend}</legend>
      {tarjetas.length > 0 ? (
        <div className="tarjetas-seleccionables">
          {tarjetas.map((tarjeta, indice) => {
            const aviso = avisos[tarjeta.id];
            return (
              <TarjetaSeleccionable
                key={tarjeta.id}
                tipo="checkbox"
                name={id}
                value={tarjeta.id}
                titulo={tarjeta.titulo}
                detalles={tarjeta.detalles}
                estado={tarjeta.estado}
                aviso={aviso && aviso !== tarjeta.estado?.texto ? aviso : undefined}
                seleccionada={valor.includes(tarjeta.id)}
                deshabilitada={tarjeta.deshabilitada}
                onChange={() => alternar(tarjeta.id)}
                inputProps={{
                  id: `${id}-${tarjeta.id}`,
                  'aria-invalid': indice === indiceFoco ? true : undefined,
                  'aria-describedby': indice === indiceFoco ? errorId : undefined,
                }}
              />
            );
          })}
        </div>
      ) : (
        textoVacio && <p className="seleccion-tarjetas-vacio">{textoVacio}</p>
      )}
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

export default SeleccionTarjetas;
