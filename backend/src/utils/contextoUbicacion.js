// Réplica de conContexto de frontend/src/utils/googleMaps.js: lo que se manda a
// geocodificar para calcular los km tiene que ser exactamente lo que el link de
// "Ver recorrido en Google Maps" usa para el mismo punto, así los dos
// interpretan igual el nombre. Si cambia una, cambiar la otra (los tests de las
// dos tienen los mismos casos: tests/contextoUbicacion.test.js y
// googleMaps.test.js).
//
// Sin contexto geográfico, "San Martín" o "Museo del Kempes" pueden resolverse
// en cualquier lado. Si el nombre no trae coma (ej. "Alta Gracia, Córdoba"), se
// le agrega la provincia.
const conContexto = (nombre) => (nombre.includes(',') ? nombre : `${nombre}, Córdoba, Argentina`);

module.exports = { conContexto };
