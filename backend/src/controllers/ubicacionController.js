const ubicacionService = require('../services/ubicacionService');

// Solo frecuentes (ver ubicacionService.buscar).
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
  if (err instanceof ubicacionService.ConflictoError) {
    return res.status(409).json({ error: err.message });
  }
  if (err instanceof ubicacionService.ErrorMapa) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  throw err;
}

// Alta por nombre de una frecuente (sin lugar en el mapa).
async function crear(req, res) {
  const { nombre } = req.body ?? {};

  try {
    const ubicacion = await ubicacionService.buscarOCrear({ nombre });
    return res.status(200).json({ ubicacion });
  } catch (err) {
    return responderError(res, err);
  }
}

async function sugerenciasGoogle(req, res) {
  const { texto, sessionToken } = req.query;
  try {
    const sugerencias = await ubicacionService.sugerenciasGoogle({ texto, sessionToken });
    return res.json({ sugerencias });
  } catch (err) {
    return responderError(res, err);
  }
}

// { placeId, sessionToken, frecuente, nombre }: nombre es el texto principal de
// la sugerencia (solo se usa si se guarda como frecuente).
async function crearDesdeGoogle(req, res) {
  const { placeId, sessionToken, frecuente, nombre } = req.body ?? {};
  try {
    const ubicacion = await ubicacionService.crearDesdeGoogle({ placeId, sessionToken, frecuente, nombre });
    return res.json({ ubicacion });
  } catch (err) {
    return responderError(res, err);
  }
}

async function ubicarDesdeGoogle(req, res) {
  const { placeId, sessionToken } = req.body ?? {};
  try {
    const ubicacion = await ubicacionService.ubicarDesdeGoogle(req.params.id, { placeId, sessionToken });
    return res.json({ ubicacion });
  } catch (err) {
    return responderError(res, err);
  }
}

module.exports = { listar, crear, sugerenciasGoogle, crearDesdeGoogle, ubicarDesdeGoogle };
