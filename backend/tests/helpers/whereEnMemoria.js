// Evalúa un `where` y un `orderBy` de Prisma sobre filas en memoria, para los
// dobles de los tests del listado de viajes (viajesPendientes.test.js y
// viajesListado.test.js). Cubre solo lo que usan esos filtros: igualdad (también
// con null), `equals`, `not`, `in`, `lt`/`gte`/`lte`, `contains` (con
// `mode: 'insensitive'`), `is`, `some`, `OR`, `AND` y relaciones anidadas. Si un
// filtro empieza a usar otra cosa, falla en vez de dar un resultado inventado.

const OPERADORES = new Set(['equals', 'not', 'in', 'lt', 'gte', 'lte', 'contains', 'mode']);

function cumpleOperadores(valor, condicion, clave) {
  return Object.entries(condicion).every(([operador, esperado]) => {
    switch (operador) {
      case 'equals':
        return valor === esperado;
      case 'not':
        return valor !== esperado;
      case 'in':
        return esperado.includes(valor);
      case 'lt':
        return valor != null && valor < esperado;
      case 'gte':
        return valor != null && valor >= esperado;
      case 'lte':
        return valor != null && valor <= esperado;
      case 'contains': {
        if (valor == null) return false;
        const insensible = condicion.mode === 'insensitive';
        const texto = insensible ? String(valor).toLowerCase() : String(valor);
        return texto.includes(insensible ? esperado.toLowerCase() : esperado);
      }
      case 'mode':
        if (esperado !== 'insensitive' || !('contains' in condicion)) throw new Error(`mode no soportado en ${clave}`);
        return true;
      default:
        throw new Error(`condición no soportada en ${clave}`);
    }
  });
}

function cumple(fila, where) {
  return Object.entries(where).every(([clave, condicion]) => {
    if (clave === 'OR') return condicion.some((w) => cumple(fila, w));
    if (clave === 'AND') return condicion.every((w) => cumple(fila, w));
    const valor = fila[clave];
    if (condicion === null) return valor === null || valor === undefined;
    if (typeof condicion !== 'object' || condicion instanceof Date) return valor === condicion;
    if ('is' in condicion) return valor != null && cumple(valor, condicion.is);
    if ('some' in condicion) {
      if (!Array.isArray(valor)) throw new Error(`some sobre algo que no es una lista en ${clave}`);
      return valor.some((item) => cumple(item, condicion.some));
    }
    const claves = Object.keys(condicion);
    if (claves.every((c) => OPERADORES.has(c))) return cumpleOperadores(valor, condicion, clave);
    // Relación a uno sin `is` (ej. estadoViaje: { descripcion: ... }).
    if (valor == null || typeof valor !== 'object') throw new Error(`condición no soportada en ${clave}`);
    return cumple(valor, condicion);
  });
}

// orderBy de Prisma: { campo: 'asc' | 'desc' } o { campo: { sort, nulls } }, suelto
// o en un arreglo. Los null van donde diga `nulls` (por defecto, como Postgres:
// al final en asc y al principio en desc). No modifica el arreglo recibido.
function ordenar(filas, orderBy = []) {
  const criterios = [].concat(orderBy).flatMap((o) => Object.entries(o));
  const comparable = (valor) => (valor instanceof Date ? valor.getTime() : valor);
  return [...filas].sort((a, b) => {
    for (const [campo, regla] of criterios) {
      const sort = typeof regla === 'string' ? regla : regla.sort;
      const nulls = (typeof regla === 'object' && regla.nulls) || (sort === 'asc' ? 'last' : 'first');
      const va = comparable(a[campo]);
      const vb = comparable(b[campo]);
      if (va == null && vb == null) continue;
      if (va == null || vb == null) return (va == null) === (nulls === 'last') ? 1 : -1;
      if (va !== vb) return (va < vb ? -1 : 1) * (sort === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

module.exports = { cumple, ordenar };
