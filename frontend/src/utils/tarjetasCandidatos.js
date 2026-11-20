// Ayudas para los choferes y vehículos posibles de un viaje: el orden en que se
// muestran (buscador del alta / edición y radios del modal de confirmar) y el
// texto mientras se consulta la disponibilidad. Funciones puras: NO deciden
// quién es elegible ni validan la documentación.
//
// Los imports llevan la extensión .js para que los tests (node --test) los
// resuelvan igual que Vite.

// Lo que dice cada opción del modal de confirmar mientras se consulta la disponibilidad.
export const TEXTO_VERIFICANDO = 'Verificando…';

// Los habilitados primero y los deshabilitados al final. Dentro de cada grupo se
// respeta el orden en que vienen (alfabético para choferes, por interno para
// vehículos): es un reparto estable, no un reordenamiento. Solo cambia cómo se
// MUESTRAN; los ids elegidos se guardan en el orden en que se eligieron, que
// vive aparte.
export function habilitadosPrimero(lista, estaDeshabilitado = (item) => item.deshabilitada) {
  return [...lista.filter((item) => !estaDeshabilitado(item)), ...lista.filter((item) => estaDeshabilitado(item))];
}
