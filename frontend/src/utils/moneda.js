// Formato de moneda compartido (formulario, listado, ficha y PDF): pesos
// argentinos sin decimales cuando el importe es redondo ("$ 420.000") y con dos
// cuando tiene centavos ("$ 1.250.000,50"; nunca "$ 1.250.000,5").
const OPCIONES = { style: 'currency', currency: 'ARS' };
const PESOS_REDONDOS = new Intl.NumberFormat('es-AR', { ...OPCIONES, minimumFractionDigits: 0, maximumFractionDigits: 0 });
const PESOS_CON_CENTAVOS = new Intl.NumberFormat('es-AR', { ...OPCIONES, minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Recibe centavos enteros (ver utils/importes.js). La división por 100 es solo
// para mostrar: no se vuelve a operar con el resultado.
export function formatearPesos(centavos) {
  const formato = centavos % 100 === 0 ? PESOS_REDONDOS : PESOS_CON_CENTAVOS;
  return formato.format(centavos / 100);
}
