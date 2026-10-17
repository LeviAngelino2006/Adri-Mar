const ubicacionService = require('../services/ubicacionService');

async function listar(req, res) {
  const { busqueda } = req.query;
  const ubicaciones = await ubicacionService.buscar(busqueda);
  return res.json({ ubicaciones });
}

// Errores comunes a los endpoints de ubicaciones.
function responderError(res, err) {
  if (err instanceof ubicacionService.ValidacionError) {
    return res.status(400).json({ errores: err.errores });
  }
  if (err instanceof ubicacionService.NoEncontradaError) {
    return res.status(404).json({ error: 'La ubicación no existe' });
  }
  if (err instanceof ubicacionService.ErrorMapa) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  throw err;
}

// { nombre, latitud?, longitud? }: las coordenadas son el punto que el usuario
// eligió en el mapa al crearla.
async function crear(req, res) {
  const { nombre, latitud, longitud } = req.body ?? {};

  try {
    const ubicacion = await ubicacionService.buscarOCrear({ nombre, latitud, longitud });
    return res.status(200).json({ ubicacion });
  } catch (err) {
    return responderError(res, err);
  }
}

async function actualizarCoordenadas(req, res) {
  const { latitud, longitud } = req.body ?? {};

  try {
    const ubicacion = await ubicacionService.actualizarCoordenadas(req.params.id, { latitud, longitud });
    return res.json({ ubicacion });
  } catch (err) {
    return responderError(res, err);
  }
}

async function buscarEnMapa(req, res) {
  try {
    const candidatos = await ubicacionService.buscarEnMapa(req.query.texto);
    return res.json({ candidatos });
  } catch (err) {
    return responderError(res, err);
  }
}

module.exports = { listar, crear, actualizarCoordenadas, buscarEnMapa };
