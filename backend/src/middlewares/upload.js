const multer = require('multer');

// Usamos almacenamiento en memoria para transferir el buffer directamente a Supabase
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos en formato PDF (.pdf).'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // Máximo 15 MB por documento
  },
});

module.exports = upload;
