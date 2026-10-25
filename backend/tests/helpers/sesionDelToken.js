// Doble de services/sesionService.js para los tests que NO son de sesión.
//
// En la app real, `autenticar` reconstruye la sesión de cada pedido desde la
// base (cuenta activa, persona activa, perfil y habilitación actuales). Los tests
// de cada módulo firman tokens con el perfil que necesitan probar (el mismo id
// con distintos perfiles) y sus dobles de Prisma no tienen esas tablas: este
// doble devuelve la sesión tal como viene en el token, que es lo que esos tests
// suponen. Lo que hace la sesión real lo prueban sesion.test.js (con un doble de
// la consulta) y el test de integración (contra la base migrada).
//
// Se instala ANTES de cargar la app, igual que el doble de Prisma:
//
//   const { instalarSesionDelToken } = require('./helpers/sesionDelToken');
//   instalarSesionDelToken(SRC);
//   const app = require(path.join(SRC, 'app.js'));

const path = require('node:path');

function instalarSesionDelToken(srcDir) {
  const ruta = require.resolve(path.join(srcDir, 'services', 'sesionService.js'));
  const buscarSesion = async (payload) => ({
    id: payload.id,
    personaId: payload.personaId,
    nombreUsuario: payload.nombreUsuario,
    perfil: payload.perfil,
    habilitadoParaConducir: payload.habilitadoParaConducir,
  });
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { buscarSesion } };
}

module.exports = { instalarSesionDelToken };
