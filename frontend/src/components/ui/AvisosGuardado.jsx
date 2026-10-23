import Alert from './Alert';
import './AvisosGuardado.css';

// Avisos del backend después de un guardado que salió bien (ver
// avisosDeRespuesta). Van en un Alert warning, persistente, al lado del toast de
// éxito: el toast dice que se guardó y el aviso, qué no se aplicó. Sin avisos no
// muestra nada.
function AvisosGuardado({ avisos }) {
  if (!avisos?.length) return null;
  if (avisos.length === 1) return <Alert variant="warning">{avisos[0]}</Alert>;
  return (
    <Alert variant="warning">
      <ul className="avisos-guardado">
        {avisos.map((aviso) => (
          <li key={aviso}>{aviso}</li>
        ))}
      </ul>
    </Alert>
  );
}

export default AvisosGuardado;
