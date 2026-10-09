const documentoService = require('../services/documentoService');

// Los errores del servicio traen su status HTTP; el resto sigue al manejador
// general de Express.
function responderError(err, res, next) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  return next(err);
}

// Los handlers se arman una vez por categoría de titular; `param` es el nombre
// del parámetro de ruta que trae su id (vehiculoId / choferId).
function crearHandlers(categoria, param) {
  const titularDe = (req) => ({ categoria, id: req.params[param] });

  return {
    async carpeta(req, res, next) {
      try {
        res.json(await documentoService.obtenerCarpeta(titularDe(req)));
      } catch (err) {
        responderError(err, res, next);
      }
    },

    async historial(req, res, next) {
      try {
        const historial = await documentoService.obtenerHistorial(titularDe(req), req.params.tipoDocumentoId);
        res.json({ historial });
      } catch (err) {
        responderError(err, res, next);
      }
    },

    async registrar(req, res, next) {
      try {
        const { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones } = req.body ?? {};
        const documento = await documentoService.registrarDocumento(
          titularDe(req),
          { tipoDocumentoId, fechaEmision, fechaVencimiento, observaciones },
          req.file,
          req.usuario.id
        );
        res.status(201).json({ mensaje: 'Documento registrado exitosamente.', documento });
      } catch (err) {
        responderError(err, res, next);
      }
    },

    async eliminar(req, res, next) {
      try {
        res.json(await documentoService.eliminarDocumento(titularDe(req), req.params.documentoId));
      } catch (err) {
        responderError(err, res, next);
      }
    },
  };
}

const vehiculo = crearHandlers('VEHICULO', 'vehiculoId');
const chofer = crearHandlers('CHOFER', 'choferId');

async function obtenerAlertas(req, res, next) {
  try {
    res.json(await documentoService.obtenerAlertasVencimiento());
  } catch (err) {
    next(err);
  }
}

async function listarTipos(req, res, next) {
  try {
    const { categoria } = req.query;
    const tipos = await documentoService.listarTipos(categoria || 'VEHICULO');
    res.json({ tipos });
  } catch (err) {
    responderError(err, res, next);
  }
}

async function obtenerEstadoFlota(req, res, next) {
  try {
    res.json({ vehiculos: await documentoService.obtenerEstado('VEHICULO') });
  } catch (err) {
    next(err);
  }
}

async function obtenerEstadoChoferes(req, res, next) {
  try {
    res.json({ choferes: await documentoService.obtenerEstado('CHOFER') });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  obtenerAlertas,
  listarTipos,
  obtenerEstadoFlota,
  obtenerEstadoChoferes,
  obtenerPorVehiculo: vehiculo.carpeta,
  obtenerHistorial: vehiculo.historial,
  registrarDocumentoVehiculo: vehiculo.registrar,
  eliminarDocumentoVehiculo: vehiculo.eliminar,
  obtenerPorChofer: chofer.carpeta,
  obtenerHistorialChofer: chofer.historial,
  registrarDocumentoChofer: chofer.registrar,
  eliminarDocumentoChofer: chofer.eliminar,
};
