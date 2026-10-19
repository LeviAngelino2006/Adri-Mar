import { useId, useState } from 'react';
import ConfirmModal from './ui/ConfirmModal';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import useSugerenciasGoogle from './useSugerenciasGoogle';
import { mensajeErrorGoogle } from '../utils/sugerenciasGoogle';
import './UbicarConGoogle.css';

const ICONO_PIN = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

// Ubica en el mapa una ubicación existente que no lo está (ej. un colegio que
// vino del Excel), desde el error de "Calcular km". Es el mismo buscador de
// Google del selector de ubicaciones: arranca buscando el nombre de la
// ubicación y el usuario elige el lugar correcto. El nombre no cambia: de
// Google solo se toma el placeId.
//
//  - nombre: el de la ubicación (título y texto inicial de la búsqueda).
//  - onUbicar({ placeId, sessionToken }): guarda (PUT ubicar-desde-google); si
//    la promesa falla, el error del backend se muestra acá y el modal sigue
//    abierto.
//  - onCancelar.
function UbicarConGoogle({ nombre, onUbicar, onCancelar }) {
  const id = useId();
  const [texto, setTexto] = useState(nombre);
  const [elegida, setElegida] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const google = useSugerenciasGoogle(texto, true);

  async function confirmar() {
    if (guardando) return;
    if (!elegida) {
      setError('Elegí uno de los lugares de Google.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await onUbicar({ placeId: elegida.placeId, sessionToken: google.sessionToken });
    } catch (err) {
      setError(mensajeErrorGoogle(err));
      google.renovarSesion();
      setGuardando(false);
    }
  }

  return (
    <ConfirmModal
      open
      tone="brand"
      size="wide"
      icon={ICONO_PIN}
      title={`Ubicar "${nombre}" en el mapa`}
      description={
        <div className="ubicar-google">
          <FormField id={`${id}-texto`} label="Buscar en Google Maps">
            <input
              type="text"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setElegida(null);
                setError(null);
              }}
              // Enter no tiene que enviar el formulario del viaje (el modal se
              // renderiza adentro del <form>).
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              autoComplete="off"
            />
          </FormField>

          {!google.hayTexto && <p className="ubicar-google-nota">Escribí al menos 3 letras.</p>}
          {google.hayTexto && google.cargando && <p className="ubicar-google-nota">Buscando en Google…</p>}
          {google.hayTexto && !google.cargando && google.error && <Alert variant="error">{google.error}</Alert>}
          {google.hayTexto && !google.cargando && !google.error && google.sugerencias.length === 0 && (
            <p className="ubicar-google-nota">Google no encontró ese lugar. Probá con otro texto.</p>
          )}
          {google.sugerencias.length > 0 && !google.cargando && (
            <>
              <ul className="ubicar-google-candidatos" role="radiogroup" aria-label="Lugares de Google">
                {google.sugerencias.map((s) => (
                  <li key={s.placeId}>
                    <label className={elegida?.placeId === s.placeId ? 'ubicar-google-candidato is-elegido' : 'ubicar-google-candidato'}>
                      <input
                        type="radio"
                        name={`${id}-lugar`}
                        checked={elegida?.placeId === s.placeId}
                        onChange={() => {
                          setElegida(s);
                          setError(null);
                        }}
                      />
                      <span>
                        <span className="ubicar-google-principal">{s.textoPrincipal}</span>
                        {s.textoSecundario && <span className="ubicar-google-secundario">{s.textoSecundario}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="ubicar-google-atribucion">Google Maps</p>
            </>
          )}

          {error && <Alert variant="error">{error}</Alert>}
        </div>
      }
      confirmLabel={guardando ? 'Guardando…' : 'Guardar ubicación'}
      onConfirm={confirmar}
      onCancel={onCancelar}
    />
  );
}

export default UbicarConGoogle;
