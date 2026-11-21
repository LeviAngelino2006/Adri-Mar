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
};

const CODIGOS = Object.keys(TIPOS_DOCUMENTO);

// Tipo de carnet de la Licencia de Conducir (SCRUM-255): se elige al cargar
// cada versión. Mismos códigos que valida el backend (documentoService).
export const TIPO_LICENCIA_CONDUCIR = 'LICENCIA_CONDUCIR';
export const TIPOS_LICENCIA = [
  { value: 'D2_MUNICIPAL', label: 'D2 Municipal' },
  { value: 'D2_PROVINCIAL', label: 'D2 Provincial' },
  { value: 'CARNET_NACIONAL', label: 'Carnet nacional' },
];

// "D2 Provincial"; las licencias cargadas antes no tienen tipo.
export function etiquetaTipoLicencia(codigo) {
  if (!codigo) return 'Tipo de carnet sin especificar';
  return TIPOS_LICENCIA.find((t) => t.value === codigo)?.label ?? codigo;
}

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
