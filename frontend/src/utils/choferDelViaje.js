// ¿El usuario logueado es el chofer de este viaje?
//
// Desde la separación de personas y usuarios, el chofer de un viaje es una
// PERSONA (`viaje.choferId` es el id de la persona) y el usuario logueado trae su
// persona en `usuario.personaId` (login y token). Nunca se compara con
// `usuario.id`: el id del usuario y el de su persona pueden ser distintos.
//
// Sin persona (personaId null o una sesión vieja sin la clave) no es el chofer de
// ningún viaje, ni siquiera de uno sin chofer.
export function esChoferDelViaje(viaje, usuario) {
  const personaId = usuario?.personaId;
  if (personaId == null || !viaje) return false;
  return (viaje.choferId ?? viaje.chofer?.id) === personaId;
}
