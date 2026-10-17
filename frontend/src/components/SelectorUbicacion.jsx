import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import PasoUbicarEnMapa from './PasoUbicarEnMapa';

// Selector de ubicaciones (origen, destino, paradas de un viaje; origen y
// destino de un presupuesto): SelectorBuscarOCrear contra /ubicaciones, donde
// "+ Crear" pide además el punto en el mapa (PasoUbicarEnMapa). Así toda
// ubicación nueva nace con coordenadas y el cálculo de km no tiene que
// interpretar su nombre. Las props (y las de accesibilidad que agrega
// FormField) pasan tal cual al selector.
function SelectorUbicacion({ placeholder = 'Buscar o crear ubicación…', ...props }) {
  return (
    <SelectorBuscarOCrear
      endpoint="/ubicaciones"
      placeholder={placeholder}
      pasoCrear={({ nombre, onConfirmar, onCancelar }) => (
        <PasoUbicarEnMapa
          nombre={nombre}
          textoConfirmar="Crear ubicación"
          onConfirmar={onConfirmar}
          onCancelar={onCancelar}
        />
      )}
      {...props}
    />
  );
}

export default SelectorUbicacion;
