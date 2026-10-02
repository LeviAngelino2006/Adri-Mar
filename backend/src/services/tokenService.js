const jwt = require('jsonwebtoken');

function ttlMinutosParaPerfil(perfil) {
  const minutos =
    perfil === 'CHOFER'
      ? process.env.SESSION_TTL_CHOFER_MIN
      : process.env.SESSION_TTL_OTROS_MIN;

  return Number(minutos) || 60;
}

function generarToken(usuario) {
  const payload = {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    perfil: usuario.perfil,
    habilitadoParaConducir: usuario.habilitadoParaConducir,
  };

  const ttlMinutos = ttlMinutosParaPerfil(usuario.perfil);

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: `${ttlMinutos}m`,
  });
}

function verificarToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { generarToken, verificarToken, ttlMinutosParaPerfil };
