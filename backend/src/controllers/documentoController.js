const documentoService = require('../services/documentoService');

async function obtenerAlertas(req, res) {
  try {
    const resumen = await documentoService.obtenerAlertasVencimiento();
    return res.json(resumen);
  } catch (err) {
    console.error('Error al obtener alertas de vencimiento:', err);
    return res.status(500).json({ mensaje: 'Error al obtener alertas de vencimiento' });
  }
}

async function crearDocumentoVehiculo(req, res) {
  const { vehiculoId, tipo, numeroComprobante, fechaVencimiento, observaciones } = req.body;

  if (!vehiculoId || !tipo || !fechaVencimiento) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios (vehiculoId, tipo, fechaVencimiento)' });
  }

  try {
    const nuevoDoc = await documentoService.crearDocumentoVehiculo({
      vehiculoId,
      tipo,
      numeroComprobante,
      fechaVencimiento,
      observaciones,
    });
    return res.status(201).json({ documento: nuevoDoc });
  } catch (err) {
    console.error('Error al crear documento de vehículo:', err);
    return res.status(500).json({ mensaje: 'Error al crear documento de vehículo' });
  }
}

async function crearDocumentoUsuario(req, res) {
  const { usuarioId, tipo, numeroComprobante, fechaVencimiento, observaciones } = req.body;

  if (!usuarioId || !tipo || !fechaVencimiento) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios (usuarioId, tipo, fechaVencimiento)' });
  }

  try {
    const nuevoDoc = await documentoService.crearDocumentoUsuario({
      usuarioId,
      tipo,
      numeroComprobante,
      fechaVencimiento,
      observaciones,
    });
    return res.status(201).json({ documento: nuevoDoc });
  } catch (err) {
    console.error('Error al crear documento de usuario:', err);
    return res.status(500).json({ mensaje: 'Error al crear documento de usuario' });
  }
}

module.exports = {
  obtenerAlertas,
  crearDocumentoVehiculo,
  crearDocumentoUsuario,
};
