// Avisos que manda el backend junto con un guardado que salió bien: algo que el
// usuario tiene que saber aunque se haya guardado (por ejemplo, un dato que se
// ignoró). Llegan como `avisos` en la respuesta, un objeto { campo: mensaje } o
// una lista de mensajes. Devuelve la lista de mensajes, sin vacíos; [] si no hay.
export function avisosDeRespuesta(data) {
  const avisos = data?.avisos;
  if (!avisos) return [];
  const mensajes = Array.isArray(avisos) ? avisos : Object.values(avisos);
  return mensajes.filter((mensaje) => typeof mensaje === 'string' && mensaje.trim() !== '');
}
