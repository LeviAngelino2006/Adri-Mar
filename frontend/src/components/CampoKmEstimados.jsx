import FormField from './ui/FormField';
import Button from './ui/Button';
import AtribucionGoogle from './AtribucionGoogle';
import './CampoKmEstimados.css';

// Campo "Kilómetros estimados" del formulario de viaje con el botón "Calcular
// km" al lado. El resultado del cálculo va en el propio input; debajo, en el
// hint, solo la atribución de Google (y el aviso si el recorrido cambió).
// Solo presenta: el estado y la llamada al
// backend viven en ViajeForm. El input sigue siendo editable a mano; un error
// del cálculo se muestra como mensaje del campo y no bloquea nada.
//
//  - errorValidacion: error del backend al guardar el viaje (tiene prioridad).
//  - errorCalculo: { mensaje, faltantes } del último "Calcular km" fallido, si
//    sigue vigente. faltantes: ubicaciones sin coordenadas, cada una con su
//    acción para ubicarla en el mapa (onUbicar).
//  - estimacion: { resultado, desactualizado } | null.

// El valor del input es string ("238", o "" si está vacío) y el calculado es
// number: el dato es de Google solo si el input sigue teniendo ese número.
function esValorCalculado(valor, kilometros) {
  if (valor == null || String(valor).trim() === '') return false;
  return Number(valor) === kilometros;
}

function hintDelCampo(puedeCalcular, valor, estimacion) {
  if (!puedeCalcular) return 'Elegí origen y destino para calcularlos';
  // Si el usuario editó los km a mano el dato ya no es de Google: sin
  // atribución ni aviso.
  if (!estimacion?.resultado || !esValorCalculado(valor, estimacion.resultado.kilometros)) return undefined;
  if (!estimacion.desactualizado) return <AtribucionGoogle />;
  return (
    <span className="campo-km-hint-fila">
      <span className="campo-km-desactualizado" role="status">
        Cambió el recorrido: recalculá
      </span>
      <AtribucionGoogle />
    </span>
  );
}

function CampoKmEstimados({
  valor,
  onChange,
  requerido,
  errorValidacion,
  errorCalculo,
  onUbicar,
  puedeCalcular,
  calculando,
  onCalcular,
  estimacion,
}) {
  const faltantes = errorCalculo?.faltantes ?? [];
  const error =
    errorValidacion ||
    (errorCalculo && (
      <>
        {errorCalculo.mensaje}
        {/* Separadas por un espacio (no por margen): si una baja de renglón,
            arranca sin sangría. */}
        {faltantes.map((u) => (
          <span key={u.ubicacionId}>
            {' '}
            <button type="button" className="campo-km-ubicar" onClick={() => onUbicar(u)}>
              {faltantes.length === 1 ? 'Ubicarla' : `Ubicar ${u.nombre}`}
            </button>
          </span>
        ))}
      </>
    ));

  return (
    <div className="campo-km">
      <FormField
        id="kilometrosEstimados"
        label="Kilómetros estimados"
        error={error || undefined}
        hint={hintDelCampo(puedeCalcular, valor, estimacion)}
        required={requerido}
      >
        <input type="number" name="kilometrosEstimados" value={valor} onChange={onChange} />
      </FormField>
      <Button
        variant="secondary"
        className="campo-km-boton"
        onClick={onCalcular}
        disabled={!puedeCalcular}
        loading={calculando}
      >
        Calcular km
      </Button>
    </div>
  );
}

export default CampoKmEstimados;
