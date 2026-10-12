const fs = require('fs/promises');
const path = require('path');

// Firmas escaneadas que lleva el PDF de los presupuestos. No viven en el front
// (ni en public/ ni en el bundle) ni en el repo, que es público: el backend las
// lee de una carpeta privada y las sirve solo a Administrador y Encargado.
//
// La carpeta es FIRMAS_DIR (en Render, la de los Secret Files: /etc/secrets) o,
// si no está definida, backend/privado/firmas, que está en .gitignore.
//
// Render solo acepta Secret Files de texto (pegados, 1 MB entre todos), así que
// en producción cada firma es `firma-<nombre>.jpg.b64` con el JPG en base64. Si
// ese archivo no está, se lee `firma-<nombre>.jpg` tal cual (desarrollo). Ver
// backend/README.md.

// Whitelist: el nombre de la URL nunca se usa para armar la ruta, solo para
// elegir uno de estos archivos.
const ARCHIVOS_FIRMA = {
  marina: 'firma-marina.jpg',
  pedro: 'firma-pedro.jpg',
};

const DIRECTORIO_POR_DEFECTO = path.join(__dirname, '..', '..', 'privado', 'firmas');

// Todo JPG empieza con FF D8 FF: así un base64 mal pegado no se sirve como imagen.
const CABECERA_JPG = Buffer.from([0xff, 0xd8, 0xff]);

function esJpg(contenido) {
  return contenido.length > CABECERA_JPG.length && contenido.subarray(0, CABECERA_JPG.length).equals(CABECERA_JPG);
}

async function leerSiExiste(ruta, codificacion) {
  try {
    return await fs.readFile(ruta, codificacion);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Bytes del JPG de la firma, o null si el nombre no está permitido, si no hay
// archivo o si su contenido no es un JPG (en ese caso deja un console.error).
// Si existe el .b64 se usa ese y nunca se cae al .jpg: un .b64 roto tiene que
// notarse, no quedar tapado.
async function leerFirma(nombre) {
  if (!Object.hasOwn(ARCHIVOS_FIRMA, nombre)) return null;

  const directorio = process.env.FIRMAS_DIR || DIRECTORIO_POR_DEFECTO;
  const rutaJpg = path.join(directorio, ARCHIVOS_FIRMA[nombre]);
  const rutaB64 = `${rutaJpg}.b64`;

  const textoB64 = await leerSiExiste(rutaB64, 'utf8');
  const [contenido, origen] =
    textoB64 === null ? [await leerSiExiste(rutaJpg), rutaJpg] : [Buffer.from(textoB64.trim(), 'base64'), rutaB64];

  if (contenido === null) return null;
  if (!esJpg(contenido)) {
    console.error(
      `Firma "${nombre}": ${origen} no es un JPG válido (no empieza con FF D8 FF). ` +
        'Si es el Secret File de Render, volvé a generar el base64 y pegalo completo (ver backend/README.md).'
    );
    return null;
  }
  return contenido;
}

module.exports = { leerFirma, ARCHIVOS_FIRMA };
