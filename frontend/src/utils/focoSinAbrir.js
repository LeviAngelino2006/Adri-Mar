// Los selectores con lista (SelectorBuscarOCrear, SelectorUbicacion,
// SelectorMultiple) se abren al recibir el foco. Cuando el foco lo pone el
// formulario para señalar un error (useFocoEnPrimerError), la lista abierta
// taparía los errores de abajo: el input se marca con este atributo mientras se
// enfoca, y el selector no se abre. Con un clic o al escribir se abre igual.
const ATRIBUTO = 'data-foco-sin-abrir';

export function enfocarSinAbrir(elemento) {
  elemento.setAttribute(ATRIBUTO, '');
  try {
    elemento.focus({ preventScroll: true });
  } finally {
    elemento.removeAttribute(ATRIBUTO);
  }
}

// Handler de onFocus para un selector: abre la lista salvo que el foco venga de
// enfocarSinAbrir.
export const abrirAlEnfocar = (abrir) => (e) => {
  if (!e.currentTarget.hasAttribute(ATRIBUTO)) abrir();
};
