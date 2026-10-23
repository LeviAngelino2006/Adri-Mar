const marcaService = require('../services/marcaService');
const modeloService = require('../services/modeloService');

async function listar(req, res) {
  const { busqueda } = req.query;
  const marcas = await marcaService.buscar(busqueda);
  return res.json({ marcas });
}

async function crear(req, res) {
  const { nombre } = req.body;

  try {
    const marca = await marcaService.buscarOCrear({ nombre });
    return res.status(200).json({ marca });
  } catch (err) {
    if (err instanceof marcaService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

async function listarModelos(req, res) {
  const { busqueda } = req.query;

  try {
    const modelos = await modeloService.buscar(req.params.marcaId, busqueda);
    return res.json({ modelos });
  } catch (err) {
    if (err instanceof modeloService.MarcaNoEncontradaError) {
      return res.status(404).json({ error: 'Marca no encontrada' });
    }
    throw err;
  }
}

async function crearModelo(req, res) {
  const { nombre } = req.body;

  try {
    const modelo = await modeloService.buscarOCrear({ marcaId: req.params.marcaId, nombre });
    return res.status(200).json({ modelo });
  } catch (err) {
    if (err instanceof modeloService.MarcaNoEncontradaError) {
      return res.status(404).json({ error: 'Marca no encontrada' });
    }
    if (err instanceof modeloService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { listar, crear, listarModelos, crearModelo };
