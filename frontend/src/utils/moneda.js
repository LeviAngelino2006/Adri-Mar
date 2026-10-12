// Formato de moneda compartido (formulario, listado, ficha y PDF): pesos
// argentinos sin decimales cuando el importe es redondo ("$ 464.100") y con
// hasta dos cuando no ("$ 1.364,19").
const FORMATO_PESOS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Recibe centavos enteros (ver utils/importes.js). La división por 100 es solo
// para mostrar: no se vuelve a operar con el resultado.
export function formatearPesos(centavos) {
  return FORMATO_PESOS.format(centavos / 100);
}
