const documentoService = require('../services/documentoService');

async function listarTipos(req, res, next) {
  try {
    const { aplicaA } = req.query;
    const tipos = await documentoService.listarTipos(aplicaA || 'VEHICULO');
    res.json({ tipos });
  } catch (err) {
    next(err);
  }
}

async function obtenerPorVehiculo(req, res, next) {
  try {
    const { vehiculoId } = req.params;
    const resultado = await documentoService.obtenerDocumentacionVehiculo(vehiculoId);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function obtenerHistorial(req, res, next) {
  try {
    const { vehiculoId, tipoDocumentoId } = req.params;
    const historial = await documentoService.obtenerHistorialDocumento(vehiculoId, tipoDocumentoId);
    res.json({ historial });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function registrarDocumentoVehiculo(req, res, next) {
  try {
    const { vehiculoId } = req.params;
    const { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones } = req.body;
    const file = req.file;
    const usuarioId = req.usuario.id;

    if (!tipoDocumentoId) {
      return res.status(400).json({ error: 'El campo tipoDocumentoId es obligatorio.' });
    }

    const documento = await documentoService.registrarDocumentoVehiculo({
      vehiculoId,
      tipoDocumentoId,
      fechaEmision,
      fechaVencimiento,
      observaciones,
      file,
      usuarioId,
    });

    res.status(201).json({
      mensaje: 'Documento registrado exitosamente.',
      documento,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function eliminarDocumentoVehiculo(req, res, next) {
  try {
    const { vehiculoId, documentoId } = req.params;
    const resultado = await documentoService.eliminarDocumentoVehiculo(vehiculoId, documentoId);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  listarTipos,
  obtenerPorVehiculo,
  obtenerHistorial,
  registrarDocumentoVehiculo,
  eliminarDocumentoVehiculo,
};
