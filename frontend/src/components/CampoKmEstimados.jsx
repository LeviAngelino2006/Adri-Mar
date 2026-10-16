import FormField from './ui/FormField';
import Button from './ui/Button';
import ResultadoEstimacionKm from './ResultadoEstimacionKm';
import './CampoKmEstimados.css';

// Campo "Kilómetros estimados" del formulario de viaje con el botón "Calcular
// km" al lado y el resultado debajo. Solo presenta: el estado y la llamada al
// backend viven en ViajeForm. El input sigue siendo editable a mano; un error
// del cálculo se muestra como mensaje del campo y no bloquea nada.
//
//  - errorValidacion: error del backend al guardar el viaje (tiene prioridad).
//  - errorCalculo: mensaje del último "Calcular km" fallido, si sigue vigente.
//  - estimacion: { resultado, desactualizado } | null.
function CampoKmEstimados({
  valor,
  onChange,
  requerido,
  errorValidacion,
  errorCalculo,
  puedeCalcular,
  calculando,
  onCalcular,
  estimacion,
}) {
  return (
    <div>
      <div className="campo-km">
        <FormField
          id="kilometrosEstimados"
          label="Kilómetros estimados"
          error={errorValidacion || errorCalculo}
          hint={puedeCalcular ? undefined : 'Elegí origen y destino para calcularlos'}
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
      <ResultadoEstimacionKm resultado={estimacion?.resultado} desactualizado={estimacion?.desactualizado} />
    </div>
  );
}

export default CampoKmEstimados;
