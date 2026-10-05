// Solo para COMPARAR (detectar duplicados por variante de mayúsculas/
// acentos/espacios: "Río Tercero" vs "RIO TERCERO" vs "rio   tercero"). El
// nombre que se persiste siempre es el que el usuario tipeó tal cual, nunca
// el normalizado. El plegado de acentos usa NFD (separa cada letra de su
// marca de acento) + strip de marcas combinantes, en vez de alguna extensión
// de Postgres (unaccent), para no atar la lógica de duplicados a algo que
// haya que instalar en la base.
function normalizarNombre(nombre) {
  return (nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

module.exports = { normalizarNombre };
