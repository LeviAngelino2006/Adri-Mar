import './Logo.css';

// Logo del sistema: el ícono del odómetro (docs/logo/logo-icono.svg, inline
// para que escale sin pérdida) y, al lado, el nombre en HTML.
// - tamano: alto del ícono en px; el texto y la separación se calculan a partir de él.
// - variante: "claro" sobre fondos claros, "sobreMarca" sobre el azul de marca
//   (cambian solo los colores del texto; el ícono es siempre el mismo).
// - soloIcono: sin el nombre al lado.
function Logo({ tamano = 36, variante = 'claro', soloIcono = false, className = '' }) {
  const clases = ['logo', `logo-${variante}`, className].filter(Boolean).join(' ');

  return (
    <div className={clases} style={{ '--logo-tamano': `${tamano}px` }} role="img" aria-label="Adri-Mar Gestión Online">
      <svg className="logo-icono" viewBox="0 0 48 48" width={tamano} height={tamano} aria-hidden="true" focusable="false">
        <rect width="48" height="48" rx="11" fill="#0535a6" />
        <path d="M33.19 21.81 A13 13 0 0 1 37 31" fill="none" stroke="#6584ce" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M11 31 A13 13 0 0 1 33.19 21.81" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M24 31 L30.4 24.6" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="24" cy="31" r="3.4" fill="#fff" />
      </svg>
      {!soloIcono && (
        <span className="logo-texto">
          <span className="logo-nombre">Adri-Mar</span>
          <span className="logo-bajada">Gestión Online</span>
        </span>
      )}
    </div>
  );
}

export default Logo;
