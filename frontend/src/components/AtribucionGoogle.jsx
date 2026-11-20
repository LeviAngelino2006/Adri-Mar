import logo from '../assets/google-maps-logo.svg';
import './AtribucionGoogle.css';

// Atribución que piden los términos de Google cuando un dato de sus APIs
// (Routes, Places) se muestra sin un mapa de Google: el logo oficial, sin
// modificar. La alineación la decide el contenedor. Es un <span> para poder
// ir dentro de contenido de texto.
export const ATRIBUCION_GOOGLE = 'Google Maps';

function AtribucionGoogle() {
  return (
    <span className="atribucion-google">
      <img className="atribucion-google-logo" src={logo} alt={ATRIBUCION_GOOGLE} />
    </span>
  );
}

export default AtribucionGoogle;
