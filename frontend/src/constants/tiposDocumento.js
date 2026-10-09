// Etiquetas de los tipos de documento. El backend solo guarda y devuelve el
// código (tipo.descripcion); acá vive el texto visible. El orden de las claves
// es el orden en que se muestran las tarjetas de la carpeta documental.
export const TIPOS_DOCUMENTO = {
  // Vehículos
  POLIZA_SEGURO: 'Póliza de seguro',
  CERT_COBERTURA: 'Certificado de cobertura',
  PAGO_SEGURO: 'Comprobante de pago de seguro',
  ITV: 'Inspección Técnica Vehicular (ITV)',
  MATAFUEGOS: 'Control de Matafuegos',
  TITULO_VEHICULO: 'Título del automotor',
  CEDULA_IDENTIFICACION: 'Cédula de identificación (Tarjeta Verde)',
  ALTA_TRANSPORTE: 'Certificado de alta de transporte',
  // Choferes
  LICENCIA_CONDUCIR: 'Licencia de conducir profesional',
  DNI_CHOFER: 'Documento Nacional de Identidad (DNI)',
  EXAMEN_PSICOFISICO: 'Examen psicofísico / LINTI',
};

const CODIGOS = Object.keys(TIPOS_DOCUMENTO);

// Un tipo que todavía no está en la constante muestra su código.
export function etiquetaTipoDocumento(codigo) {
  return TIPOS_DOCUMENTO[codigo] ?? codigo;
}

// Ordena según TIPOS_DOCUMENTO; los códigos desconocidos van al final, en el
// orden en que llegaron. `codigoDe` extrae el código de cada elemento.
export function ordenarPorTipoDocumento(items, codigoDe) {
  const posicion = (item) => {
    const indice = CODIGOS.indexOf(codigoDe(item));
    return indice === -1 ? CODIGOS.length : indice;
  };
  return [...items].sort((a, b) => posicion(a) - posicion(b));
}
