const lecturaOdometroService = require('../services/lecturaOdometroService');

async function corregir(req, res) {
  const { valorKm, motivo } = req.body;

  try {
    const resultado = await lecturaOdometroService.corregirLectura({
      lecturaCorregidaId: req.params.id,
      valorKm,
      motivo,
      usuarioId: req.usuario.id,
    });
    return res.json(resultado);
  } catch (err) {
    if (err instanceof lecturaOdometroService.NoEncontradoError) {
      return res.status(404).json({ error: 'Lectura no encontrada' });
    }
    if (err instanceof lecturaOdometroService.ValidacionError) {
      return res.status(400).json({ errores: err.errores });
    }
    throw err;
  }
}

module.exports = { corregir };
