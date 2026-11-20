import { useId } from 'react';
import './TarjetaSeleccionable.css';

// Tarjeta que se elige con un toque: un <label> que contiene un input REAL
// (checkbox o radio, visualmente oculto), así funciona con teclado (Tab, espacio
// y flechas en los radios) y con lectores de pantalla, y el foco se ve en la
// tarjeta entera. Es genérica: quien la usa le pasa el título, los detalles y el
// estado ya armados (ver utils/tarjetasCandidatos para choferes y vehículos).
// Ver docs/design-system/componentes/TarjetaSeleccionable.md.
//
//  - `tipo`: 'checkbox' (selección múltiple) o 'radio' (selección única, con el
//    mismo `name` en todo el grupo).
//  - `seleccionada`: controlada; `onChange()` se llama al marcar o desmarcar.
//  - `estado`: { texto, tono: 'ok' | 'error' } — la habilitación ("Habilitado",
//    "Documentación vencida (Licencia de conducir)").
//  - `deshabilitada`: no se puede elegir y se ve apagada; el motivo va en
//    `estado` (tono 'error'). Si ya venía elegida (un dato guardado antes de que
//    venciera el documento) se puede QUITAR, pero no volver a elegir: si no, la
//    tarjeta quedaría trabada como elegida.
//  - `aviso`: texto informativo debajo (p. ej. una superposición de horario).
//    No bloquea nada.
function TarjetaSeleccionable({
  tipo = 'checkbox',
  name,
  value,
  titulo,
  detalles = [],
  estado,
  aviso,
  seleccionada = false,
  deshabilitada = false,
  onChange,
  inputProps = {},
}) {
  const idBase = useId();
  const idEstado = estado?.texto ? `${idBase}-estado` : undefined;
  const idAviso = aviso ? `${idBase}-aviso` : undefined;
  const bloqueada = deshabilitada && !seleccionada;

  const clases = ['tarjeta-seleccionable'];
  if (seleccionada) clases.push('tarjeta-seleccionable-seleccionada');
  if (deshabilitada) clases.push('tarjeta-seleccionable-deshabilitada');
  if (aviso) clases.push('tarjeta-seleccionable-con-aviso');

  const describedBy = [inputProps['aria-describedby'], idEstado, idAviso].filter(Boolean).join(' ') || undefined;

  return (
    <label className={clases.join(' ')}>
      <input
        {...inputProps}
        type={tipo}
        className="tarjeta-seleccionable-input"
        name={name}
        value={value}
        checked={seleccionada}
        disabled={bloqueada}
        onChange={() => {
          if (!bloqueada) onChange?.();
        }}
        aria-describedby={describedBy}
      />
      <span className={`tarjeta-seleccionable-marca tarjeta-seleccionable-marca-${tipo}`} aria-hidden="true" />
      <span className="tarjeta-seleccionable-cuerpo">
        <span className="tarjeta-seleccionable-titulo">{titulo}</span>
        {detalles.filter(Boolean).map((detalle) => (
          <span key={detalle} className="tarjeta-seleccionable-detalle">
            {detalle}
          </span>
        ))}
        {estado?.texto && (
          <span id={idEstado} className={`tarjeta-seleccionable-estado tarjeta-seleccionable-estado-${estado.tono ?? 'ok'}`}>
            {estado.texto}
          </span>
        )}
        {aviso && (
          <span id={idAviso} className="tarjeta-seleccionable-aviso">
            {aviso}
          </span>
        )}
      </span>
    </label>
  );
}

export default TarjetaSeleccionable;
