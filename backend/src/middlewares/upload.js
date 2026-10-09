const multer = require('multer');

const MAX_BYTES = 15 * 1024 * 1024; // Máximo 15 MB por documento

// Usamos almacenamiento en memoria para transferir el buffer directamente a Supabase
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    const error = new Error('Solo se permiten archivos PDF.');
    error.code = 'ARCHIVO_NO_PDF';
    cb(error, false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});

const MENSAJES_ARCHIVO = {
  LIMIT_FILE_SIZE: 'El archivo supera el máximo de 15 MB.',
  ARCHIVO_NO_PDF: 'Solo se permiten archivos PDF.',
};

// Recibe el PDF del campo `archivo`. Los errores de multer salen en español y
// con el mismo formato por campo que el resto del backend:
// 400 { errores: { archivo: mensaje } }.
function recibirArchivo(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    const mensaje = MENSAJES_ARCHIVO[err.code] || 'No se pudo procesar el archivo adjunto.';
    return res.status(400).json({ errores: { archivo: mensaje } });
  });
}

module.exports = { recibirArchivo, MAX_BYTES };
