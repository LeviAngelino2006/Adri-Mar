const clienteService = require('../services/clienteService');

async function listar(req, res) {
  const { busqueda } = req.query;
  const clientes = await clienteService.buscar(busqueda);
  return res.json({ clientes });
}

async function crear(req, res) {
  const { nombre } = req.body;

  try {
    const cliente = await clienteService.buscarOCrear({ nombre });
    return res.status(200).json({ cliente });
  } catch (err) {
    if (err instanceof clienteService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { listar, crear };
