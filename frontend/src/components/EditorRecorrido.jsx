import FormField from './ui/FormField';
import Button from './ui/Button';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import BotonVerRecorrido from './BotonVerRecorrido';
import { MAX_PARADAS, agregarParada, elegirUbicacion, moverParada, quitarParada } from '../utils/paradas';
import './EditorRecorrido.css';

const ICONO_SUBIR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
);

const ICONO_BAJAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14" />
    <path d="M19 12l-7 7-7-7" />
  </svg>
);

const ICONO_QUITAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const PLACEHOLDER = 'Buscar o crear ubicación…';

// Bloque "Recorrido" del formulario de viaje: el origen, las paradas intermedias
// y el destino como una línea de tiempo vertical.
//
//   ● Origen
//   │ Parada 1   ↑ ↓ ✕
//   │ + Agregar parada
//   ● Destino
//
// No guarda estado: es controlado por ViajeForm (origen, destino y la lista de
// paradas viven en su formulario) y la lista se transforma con las funciones
// puras de utils/paradas. Cada punto usa el mismo SelectorBuscarOCrear con
// /ubicaciones, así que las paradas nuevas se crean igual que un origen o un
// destino.
//
//  - origen / destino: { id, nombre } (vacíos mientras no se elija).
//  - paradas: [{ clave, id, nombre }].
//  - errores: { origenId, destinoId, paradas, filasParadas: { [clave]: texto } }.
//    El error de una fila se muestra solo mientras la fila siga sin ubicación,
//    así desaparece solo cuando se la elige.
function EditorRecorrido({
  origen,
  destino,
  paradas,
  onCambiarOrigen,
  onCambiarDestino,
  onCambiarParadas,
  errores = {},
}) {
  const alMaximo = paradas.length >= MAX_PARADAS;

  return (
    <fieldset className="editor-recorrido">
      <legend className="editor-recorrido-titulo">Recorrido</legend>

      <ol className="editor-recorrido-puntos">
        <li className="editor-recorrido-punto editor-recorrido-extremo">
          <FormField id="origenId" label="Origen" error={errores.origenId} required>
            <SelectorBuscarOCrear
              endpoint="/ubicaciones"
              valor={origen.id}
              valorNombre={origen.nombre}
              onSeleccionar={onCambiarOrigen}
              placeholder={PLACEHOLDER}
            />
          </FormField>
        </li>

        {paradas.map((parada, indice) => (
          <li key={parada.clave} className="editor-recorrido-punto editor-recorrido-parada">
            <FormField
              id={`parada-${parada.clave}`}
              label={`Parada ${indice + 1}`}
              error={parada.id ? undefined : errores.filasParadas?.[parada.clave]}
            >
              <SelectorBuscarOCrear
                endpoint="/ubicaciones"
                valor={parada.id}
                valorNombre={parada.nombre}
                onSeleccionar={(item) => onCambiarParadas(elegirUbicacion(paradas, parada.clave, item))}
                placeholder={PLACEHOLDER}
              />
            </FormField>

            <div className="editor-recorrido-acciones">
              <button
                type="button"
                className="editor-recorrido-accion"
                aria-label={`Subir la parada ${indice + 1}`}
                title="Subir"
                disabled={indice === 0}
                onClick={() => onCambiarParadas(moverParada(paradas, indice, -1))}
              >
                {ICONO_SUBIR}
              </button>
              <button
                type="button"
                className="editor-recorrido-accion"
                aria-label={`Bajar la parada ${indice + 1}`}
                title="Bajar"
                disabled={indice === paradas.length - 1}
                onClick={() => onCambiarParadas(moverParada(paradas, indice, 1))}
              >
                {ICONO_BAJAR}
              </button>
              <button
                type="button"
                className="editor-recorrido-accion"
                aria-label={`Quitar la parada ${indice + 1}`}
                title="Quitar"
                onClick={() => onCambiarParadas(quitarParada(paradas, parada.clave))}
              >
                {ICONO_QUITAR}
              </button>
            </div>
          </li>
        ))}

        <li className="editor-recorrido-punto editor-recorrido-agregar">
          <Button variant="ghost" disabled={alMaximo} onClick={() => onCambiarParadas(agregarParada(paradas))}>
            + Agregar parada
          </Button>
          {alMaximo && <p className="form-field-hint">Máximo {MAX_PARADAS} paradas</p>}
        </li>

        <li className="editor-recorrido-punto editor-recorrido-extremo">
          <FormField id="destinoId" label="Destino" error={errores.destinoId} required>
            <SelectorBuscarOCrear
              endpoint="/ubicaciones"
              valor={destino.id}
              valorNombre={destino.nombre}
              onSeleccionar={onCambiarDestino}
              placeholder={PLACEHOLDER}
            />
          </FormField>
        </li>
      </ol>

      {errores.paradas && (
        <p className="form-field-error" role="alert">
          {errores.paradas}
        </p>
      )}

      <div className="editor-recorrido-mapa">
        {/* Usa los nombres elegidos en los selectores, aunque el viaje todavía
            no esté guardado; se actualiza solo al agregar o reordenar paradas. */}
        <BotonVerRecorrido origen={origen} paradas={paradas} destino={destino} />
      </div>
    </fieldset>
  );
}

export default EditorRecorrido;
