const presupuestoService = require('../services/presupuestoService');

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

module.exports = { crear, listar, obtener };
