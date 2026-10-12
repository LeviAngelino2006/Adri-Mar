// Hoja con el signo $: ítem de navegación "Presupuestos" y marca de las
// tarjetas del listado. Un solo color (currentColor), como el resto de los íconos.
function IconoPresupuesto({ tamano = 20 }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-1m0-6v-1m2 1.5c0-.83-.9-1.5-2-1.5s-2 .67-2 1.5.9 1.5 2 1.5 2 .67 2 1.5-.9 1.5-2 1.5-2-.67-2-1.5" />
    </svg>
  );
}

export default IconoPresupuesto;
