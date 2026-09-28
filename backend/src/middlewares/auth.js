const { verificarToken, generarToken } = require('../services/tokenService');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let payload;
  try {
    payload = verificarToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  req.usuario = payload;

  // Renueva el token en cada petición autenticada: el backend responde con
  // uno nuevo y el frontend reemplaza el anterior, extendiendo la sesión
  // mientras haya actividad.
  res.setHeader('X-Renewed-Token', generarToken(payload));

  next();
}

function autorizar(...perfilesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !perfilesPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }

    next();
  };
}

module.exports = { autenticar, autorizar };
