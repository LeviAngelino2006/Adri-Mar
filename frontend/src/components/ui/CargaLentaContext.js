import { createContext } from 'react';

// Un solo colectivo por pantalla. Layout provee { cargasLentas, sumar, restar }
// y muestra el colectivo arriba mientras cargasLentas es mayor que 0. Fuera de
// Layout (o con `aislado`) cada Cargando dibuja el suyo.
export const CargaLentaContext = createContext(null);
