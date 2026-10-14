const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = (process.env.SUPABASE_BUCKET_NAME || 'documentacion').replace(/"/g, '');

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Sube un buffer de archivo al bucket privado de Supabase Storage.
 * @param {Buffer} buffer - Contenido binario del archivo
 * @param {string} storagePath - Ruta de destino dentro del bucket (ej: 'vehiculos/1/POLIZA_1700000.pdf')
 * @param {string} mimeType - Tipo MIME (por defecto 'application/pdf')
 * @returns {Promise<{ path: string }>}
 */
async function subirArchivo(buffer, storagePath, mimeType = 'application/pdf') {
  if (!supabase) {
    throw new Error('Supabase Storage no está configurado en las variables de entorno.');
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Error al subir archivo a Supabase Storage: ${error.message}`);
  }

  return { path: storagePath, ...data };
}

/**
 * Genera una Signed URL temporal para visualizar o descargar un archivo privado.
 * @param {string} storagePath - Ruta dentro del bucket
 * @param {number} segundosExpiracion - Duración del enlace en segundos (default 3600 = 1 hora)
 * @returns {Promise<string>}
 */
async function generarSignedUrl(storagePath, segundosExpiracion = 3600) {
  if (!supabase || !storagePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, segundosExpiracion);

  if (error) {
    console.error(`Error al generar Signed URL para ${storagePath}:`, error.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Elimina un archivo del bucket de Supabase Storage. Lanza si falla, para que
 * quien lo llama decida qué hacer (documentoService lo atrapa y lo loguea).
 * @param {string} storagePath - Ruta del archivo en el bucket
 * @returns {Promise<boolean>} true si lo eliminó; false si no había nada que eliminar
 */
async function eliminarArchivo(storagePath) {
  if (!storagePath) {
    return false;
  }
  if (!supabase) {
    throw new Error('Supabase Storage no está configurado en las variables de entorno.');
  }

  const { error } = await supabase.storage
    .from(bucketName)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Error al eliminar ${storagePath} de Supabase Storage: ${error.message}`);
  }

  return true;
}

module.exports = {
  subirArchivo,
  generarSignedUrl,
  eliminarArchivo,
};
