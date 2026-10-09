const documentoService = require('../services/documentoService');

async function obtenerAlertas(req, res, next) {
  try {
    const resumen = await documentoService.obtenerAlertasVencimiento();
    return res.json(resumen);
  } catch (err) {
    next(err);
  }
}

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

async function obtenerEstadoFlota(req, res, next) {
  try {
    const vehiculos = await documentoService.obtenerEstadoFlota();
    res.json({ vehiculos });
  } catch (err) {
    next(err);
  }
}

async function obtenerEstadoChoferes(req, res, next) {
  try {
    const choferes = await documentoService.obtenerEstadoChoferes();
    res.json({ choferes });
  } catch (err) {
    next(err);
  }
}

async function obtenerPorChofer(req, res, next) {
  try {
    const { choferId } = req.params;
    const resultado = await documentoService.obtenerDocumentacionChofer(choferId);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function obtenerHistorialChofer(req, res, next) {
  try {
    const { choferId, tipoDocumentoId } = req.params;
    const historial = await documentoService.obtenerHistorialDocumentoChofer(choferId, tipoDocumentoId);
    res.json({ historial });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function registrarDocumentoChofer(req, res, next) {
  try {
    const { choferId } = req.params;
    const { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones } = req.body;
    const file = req.file;
    const usuarioId = req.usuario.id;

    const documento = await documentoService.registrarDocumentoChofer(
      choferId,
      {
        tipoDocumentoId,
        fechaEmision,
        fechaVencimiento,
        observaciones,
      },
      file,
      usuarioId
    );

    res.status(201).json({
      mensaje: 'Documento registrado con éxito.',
      documento,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function eliminarDocumentoChofer(req, res, next) {
  try {
    const { choferId, documentoId } = req.params;
    const resultado = await documentoService.eliminarDocumentoChofer(choferId, documentoId);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  obtenerAlertas,
  listarTipos,
  obtenerPorVehiculo,
  obtenerHistorial,
  registrarDocumentoVehiculo,
  eliminarDocumentoVehiculo,
  obtenerEstadoFlota,
  obtenerEstadoChoferes,
  obtenerPorChofer,
  obtenerHistorialChofer,
  registrarDocumentoChofer,
  eliminarDocumentoChofer,
};
