const path = require('path');

// Firmas escaneadas que lleva el PDF de los presupuestos. No viven en el front
// (ni en public/ ni en el bundle) ni en el repo, que es público: el backend las
// lee de una carpeta privada y las sirve solo a Administrador y Encargado.
//
// La carpeta es FIRMAS_DIR (en Render, la de los Secret Files: /etc/secrets) o,
// si no está definida, backend/privado/firmas, que está en .gitignore. Para
// reemplazarlas por versiones en alta resolución alcanza con pisar los archivos.

// Whitelist: el nombre de la URL nunca se usa para armar la ruta, solo para
// elegir uno de estos archivos.
const ARCHIVOS_FIRMA = {
  marina: 'firma-marina.jpg',
  pedro: 'firma-pedro.jpg',
};

const DIRECTORIO_POR_DEFECTO = path.join(__dirname, '..', '..', 'privado', 'firmas');

// Ruta absoluta del archivo de la firma, o null si el nombre no está permitido.
function rutaFirma(nombre) {
  if (!Object.hasOwn(ARCHIVOS_FIRMA, nombre)) return null;
  return path.join(process.env.FIRMAS_DIR || DIRECTORIO_POR_DEFECTO, ARCHIVOS_FIRMA[nombre]);
}

module.exports = { rutaFirma, ARCHIVOS_FIRMA };
