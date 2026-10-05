const ubicacionService = require('../services/ubicacionService');

async function listar(req, res) {
  const { busqueda } = req.query;
  const ubicaciones = await ubicacionService.buscar(busqueda);
  return res.json({ ubicaciones });
}

async function crear(req, res) {
  const { nombre } = req.body;

  try {
    const ubicacion = await ubicacionService.buscarOCrear({ nombre });
    return res.status(200).json({ ubicacion });
  } catch (err) {
    if (err instanceof ubicacionService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { listar, crear };
