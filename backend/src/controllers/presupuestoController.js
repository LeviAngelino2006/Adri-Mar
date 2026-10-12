const presupuestoService = require('../services/presupuestoService');
const { rutaFirma } = require('../services/firmaPresupuestoService');

async function crear(req, res) {
  const {
    fechaEmision,
    clienteId,
    origenId,
    destinoId,
    fechaServicio,
    horaSalida,
    cantidadPasajeros,
    importeNeto,
    conFactura,
    formaPago,
    diasValidez,
    vehiculoIds,
  } = req.body || {};

  try {
    const presupuesto = await presupuestoService.crearPresupuesto(
      {
        fechaEmision,
        clienteId,
        origenId,
        destinoId,
        fechaServicio,
        horaSalida,
        cantidadPasajeros,
        importeNeto,
        conFactura,
        formaPago,
        diasValidez,
        vehiculoIds,
      },
      req.usuario
    );
    return res.status(201).json({ presupuesto });
  } catch (err) {
    if (err instanceof presupuestoService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listar(req, res) {
  const { cliente } = req.query;
  const presupuestos = await presupuestoService.listarPresupuestos({ cliente });
  return res.json({ presupuestos });
}

async function obtener(req, res) {
  try {
    const presupuesto = await presupuestoService.obtenerPresupuesto(req.params.id);
    return res.json({ presupuesto });
  } catch (err) {
    if (err instanceof presupuestoService.NoEncontradoError) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }
    throw err;
  }
}

// Imagen de una firma para el PDF. 404 tanto si el nombre no está en la
// whitelist como si el archivo no está en el servidor (sin decir cuál).
function firma(req, res) {
  const ruta = rutaFirma(req.params.nombre);
  if (!ruta) {
    return res.status(404).json({ error: 'Firma no encontrada' });
  }
  res.set('Cache-Control', 'private, max-age=3600');
  return res.sendFile(ruta, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Firma no encontrada' });
    }
  });
}

module.exports = { crear, listar, obtener, firma };
