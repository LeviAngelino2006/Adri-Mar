import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import SelectorMultiple from './ui/SelectorMultiple';
import EditorRecorrido from './EditorRecorrido';
import CampoKmEstimados from './CampoKmEstimados';
import PasoUbicarEnMapa from './PasoUbicarEnMapa';
import { consultarDisponibilidad, estimarKm } from '../services/viajesApi';
import { ubicarEnMapa } from '../services/ubicacionesApi';
import {
  aplicarEstimacion,
  firmaRecorrido,
  idsDelRecorrido,
  mensajeErrorEstimacion,
  puedeCalcularKm,
  quitarFaltante,
  ubicacionesSinCoordenadas,
} from '../utils/estimacionKm';
import { nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import { errorDeSecuencia, paradasAPayload } from '../utils/paradas';
import { ordenarPorInterno } from '../utils/vehiculos';

const FORM_INICIAL = {
  clienteId: '',
  clienteNombre: '',
  choferId: '',
  vehiculoId: '',
  choferesCandidatos: [],
  vehiculosCandidatos: [],
  // Paradas intermedias, en orden: [{ clave, id, nombre }] (ver utils/paradas).
  paradas: [],
  origenId: '',
  origenNombre: '',
  destinoId: '',
  destinoNombre: '',
  fechaInicio: '',
  fechaFin: '',
  kilometrosEstimados: '',
  cantidadPasajeros: '',
};

const CAMPOS_OPERATIVOS = ['choferId', 'vehiculoId', 'fechaInicio', 'fechaFin', 'kilometrosEstimados'];
const ERROR_OBLIGATORIO_PROGRAMADO = 'Obligatorio para un viaje Programado.';
const ERROR_FECHA_INICIO = 'La fecha y hora de inicio es obligatoria';
const DEMORA_AVISOS_MS = 400;
const SIN_AVISOS = { choferes: {}, vehiculos: {} };

// { id: motivo } solo de los que la disponibilidad marca como no disponibles.
function avisosDe(lista) {
  return Object.fromEntries(lista.filter((item) => !item.disponible).map((item) => [item.id, item.motivo]));
}

// `estadoActual` es el estado del viaje que se está editando (undefined en
// alta). Los cinco campos operativos solo son obligatorios a nivel de
// formulario cuando se edita un viaje ya PROGRAMADO — el backend los sigue
// exigiendo ahí (ver viajeService.actualizarViaje: la obligatoriedad depende
// del estado actual, no de si el payload viene completo), así que conviene
// avisar antes de que el usuario intente guardar y se encuentre con un error
// del servidor. En alta, o editando un A_CONFIRMAR, no se exigen — con una
// excepción: la fecha de inicio es obligatoria siempre, en cualquier estado.
//
// Chofer y vehículo se cargan de una de dos maneras según el estado:
//  - Alta o edición de un A_CONFIRMAR: listas de choferes y vehículos POSIBLES
//    (SelectorMultiple, opcionales). Recién se elige uno de cada uno al
//    confirmar el viaje. Debajo de cada chip con problema (superposición, taller,
//    no habilitado) se muestra el aviso de disponibilidad; los avisos son
//    informativos y NO bloquean el guardado.
//  - Edición de un PROGRAMADO: un chofer y un vehículo, como siempre.
// Al enviar solo viaja uno de los dos juegos de campos: el backend rechaza
// choferId/vehiculoId en un A_CONFIRMAR y candidatos en un PROGRAMADO.
//
// El origen, las paradas y el destino se editan juntos en el bloque Recorrido
// (EditorRecorrido). Las paradas se pueden editar en A_CONFIRMAR y en PROGRAMADO.
// Una fila de parada sin ubicación elegida NO se descarta en silencio: frena el
// envío con un error en esa fila, y el backend solo recibe ids válidos.
//
// `candidatosActuales` ({ choferes, vehiculos }) son los candidatos que ya tiene
// el viaje que se edita: se suman a las opciones por si alguno ya no figura en
// las listas de elegibles (p. ej. un chofer dado de baja), así el chip no
// desaparece en silencio.
//
// Solo datos operativos: precio y pagos no se cargan acá sino después, desde la
// ficha del viaje (DatosAdministrativosViaje), para que el alta se enfoque en
// crear el viaje.
function ViajeForm({
  valoresIniciales,
  estadoActual,
  onSubmit,
  textoBoton,
  textoEnviando,
  onCancelar,
  candidatosActuales,
}) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(valoresIniciales || FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState(SIN_AVISOS);
  // "Calcular km": el último resultado y el último error, cada uno con la firma
  // del recorrido con el que se pidió. Si el recorrido cambia, el resultado se
  // marca desactualizado (no se recalcula solo) y el error deja de mostrarse.
  // Guardar el viaje no depende de nada de esto.
  const [estimacion, setEstimacion] = useState(null);
  // { mensaje, firma, faltantes }: faltantes son las ubicaciones sin
  // coordenadas (422), que se pueden ubicar desde el mismo error.
  const [errorKm, setErrorKm] = useState(null);
  const [calculandoKm, setCalculandoKm] = useState(false);
  // Ubicación sin coordenadas que se está ubicando en el mapa ({ ubicacionId, nombre }).
  const [ubicando, setUbicando] = useState(null);
  const idsRecorrido = idsDelRecorrido(form);
  const firmaActual = firmaRecorrido(idsRecorrido);
  const puedeCalcular = puedeCalcularKm(idsRecorrido);
  const errorKmVigente = errorKm && errorKm.firma === firmaActual ? errorKm : null;

  const requiereOperativos = estadoActual === 'PROGRAMADO';
  const usaCandidatos = !requiereOperativos;

  useEffect(() => {
    api.get('/usuarios/disponibles-chofer').then(({ data }) => setChoferes(data.usuarios));
    api
      .get('/vehiculos', { params: { estado: 'OPERATIVO' } })
      .then(({ data }) => setVehiculos(ordenarPorInterno(data.vehiculos)));
  }, []);

  // Avisos de disponibilidad de los candidatos elegidos, con las fechas que el
  // formulario tiene en pantalla (el viaje puede no estar guardado todavía).
  // Con debounce, y descartando respuestas viejas si el usuario siguió
  // cambiando datos mientras tanto.
  const hayConsulta =
    usaCandidatos &&
    Boolean(form.fechaInicio) &&
    (form.choferesCandidatos.length > 0 || form.vehiculosCandidatos.length > 0);

  useEffect(() => {
    if (!hayConsulta) return;

    let vigente = true;
    const temporizador = setTimeout(() => {
      consultarDisponibilidad({
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin || undefined,
        choferIds: form.choferesCandidatos,
        vehiculoIds: form.vehiculosCandidatos,
      })
        .then(({ data }) => {
          if (vigente) setAvisos({ choferes: avisosDe(data.choferes), vehiculos: avisosDe(data.vehiculos) });
        })
        // Los avisos son una ayuda: si la consulta falla, simplemente no hay.
        .catch(() => {
          if (vigente) setAvisos(SIN_AVISOS);
        });
    }, DEMORA_AVISOS_MS);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [hayConsulta, form.fechaInicio, form.fechaFin, form.choferesCandidatos, form.vehiculosCandidatos]);

  // Opciones de los selectores múltiples: los elegibles, más los candidatos que
  // el viaje ya tenía y no figuren en esa lista.
  const opcionesChoferes = useMemo(() => {
    const opciones = choferes.map((c) => ({ id: c.id, etiqueta: nombreChofer(c) }));
    for (const c of candidatosActuales?.choferes ?? []) {
      if (!opciones.some((o) => o.id === c.id)) opciones.push({ id: c.id, etiqueta: nombreChofer(c) });
    }
    return opciones;
  }, [choferes, candidatosActuales]);

  const opcionesVehiculos = useMemo(() => {
    const opciones = vehiculos.map((v) => ({ id: v.id, etiqueta: nombreVehiculo(v) }));
    for (const v of candidatosActuales?.vehiculos ?? []) {
      if (!opciones.some((o) => o.id === v.id)) opciones.push({ id: v.id, etiqueta: nombreVehiculo(v) });
    }
    return opciones;
  }, [vehiculos, candidatosActuales]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleCambiarParadas(paradas) {
    setForm((f) => ({ ...f, paradas }));
  }

  function handleSeleccionarCliente(item) {
    setForm((f) => ({ ...f, clienteId: item?.id || '', clienteNombre: item?.nombre || '' }));
  }

  function handleSeleccionarOrigen(item) {
    setForm((f) => ({ ...f, origenId: item?.id || '', origenNombre: item?.nombre || '' }));
  }

  async function handleCalcularKm() {
    const firma = firmaActual;
    setCalculandoKm(true);
    setErrorKm(null);
    try {
      const { data } = await estimarKm(idsRecorrido);
      setEstimacion({ resultado: data, firma });
      setForm((f) => aplicarEstimacion(f, data));
    } catch (err) {
      setErrorKm({ mensaje: mensajeErrorEstimacion(err), firma, faltantes: ubicacionesSinCoordenadas(err) });
    } finally {
      setCalculandoKm(false);
    }
  }

  // Guarda el punto de una ubicación que faltaba (si falla, el error se ve en
  // el paso). Cuando ya no falta ninguna, vuelve a calcular: es lo que el
  // usuario había pedido.
  async function handleUbicarFaltante(coordenadas) {
    await ubicarEnMapa(ubicando.ubicacionId, coordenadas);
    const restante = quitarFaltante(errorKm, ubicando.ubicacionId);
    setUbicando(null);
    setErrorKm(restante);
    if (!restante) handleCalcularKm();
  }

  function handleSeleccionarDestino(item) {
    setForm((f) => ({ ...f, destinoId: item?.id || '', destinoNombre: item?.nombre || '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrores({});

    const erroresLocales = {};
    if (requiereOperativos) {
      for (const campo of CAMPOS_OPERATIVOS) {
        if (form[campo] === '' || form[campo] === null || form[campo] === undefined) {
          erroresLocales[campo] = ERROR_OBLIGATORIO_PROGRAMADO;
        }
      }
    }
    if (!erroresLocales.fechaInicio && !form.fechaInicio) {
      erroresLocales.fechaInicio = ERROR_FECHA_INICIO;
    }

    const { ids: idsParadas, errores: erroresFilas } = paradasAPayload(form.paradas);
    if (Object.keys(erroresFilas).length > 0) {
      erroresLocales.filasParadas = erroresFilas;
    } else if (form.origenId && form.destinoId) {
      // La misma regla que valida el backend, para avisar antes de enviar.
      const mensaje = errorDeSecuencia(form.origenId, idsParadas, form.destinoId);
      if (mensaje) erroresLocales.paradas = mensaje;
    }
    if (Object.keys(erroresLocales).length > 0) {
      setErrores(erroresLocales);
      return;
    }

    setEnviando(true);
    try {
      const { choferId, vehiculoId, choferesCandidatos, vehiculosCandidatos, paradas: filasParadas, ...resto } = form;
      const asignacion = usaCandidatos ? { choferesCandidatos, vehiculosCandidatos } : { choferId, vehiculoId };
      await onSubmit({
        ...resto,
        ...asignacion,
        // Solo ids, en orden: el `orden` lo asigna el backend. No hay filas vacías
        // (ya se frenó el envío arriba).
        paradas: paradasAPayload(filasParadas).ids,
      });
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        setErrores(err.response.data.errores);
      } else if (err.response?.status === 409) {
        setErrores({ general: err.response.data.error });
      } else {
        setErrores({ general: 'No se pudo guardar el viaje' });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-field-ancho">
          <FormField id="clienteId" label="Cliente" error={errores.clienteId} required>
            <SelectorBuscarOCrear
              endpoint="/clientes"
              valor={form.clienteId}
              valorNombre={form.clienteNombre}
              onSeleccionar={handleSeleccionarCliente}
              placeholder="Buscar o crear cliente…"
            />
          </FormField>
        </div>

        <div className="form-field-ancho">
          <EditorRecorrido
            origen={{ id: form.origenId, nombre: form.origenNombre }}
            destino={{ id: form.destinoId, nombre: form.destinoNombre }}
            paradas={form.paradas}
            onCambiarOrigen={handleSeleccionarOrigen}
            onCambiarDestino={handleSeleccionarDestino}
            onCambiarParadas={handleCambiarParadas}
            errores={errores}
          />
        </div>

        <FormField
          id="fechaInicio"
          label="Fecha y hora de inicio"
          error={errores.fechaInicio}
          required
        >
          <input type="datetime-local" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} />
        </FormField>

        <FormField
          id="fechaFin"
          label="Fecha y hora de fin"
          error={errores.fechaFin}
          required={requiereOperativos}
        >
          <input type="datetime-local" name="fechaFin" value={form.fechaFin} onChange={handleChange} />
        </FormField>

        {usaCandidatos ? (
          <>
            <div className="form-field-ancho">
              <FormField
                id="choferesCandidatos"
                label="Choferes posibles"
                error={errores.choferesCandidatos || errores.choferId}
              >
                <SelectorMultiple
                  opciones={opcionesChoferes}
                  valor={form.choferesCandidatos}
                  onChange={(ids) => setForm((f) => ({ ...f, choferesCandidatos: ids }))}
                  avisos={hayConsulta ? avisos.choferes : {}}
                  placeholder="Buscar chofer…"
                />
              </FormField>
            </div>

            <div className="form-field-ancho">
              <FormField
                id="vehiculosCandidatos"
                label="Vehículos posibles"
                error={errores.vehiculosCandidatos || errores.vehiculoId}
              >
                <SelectorMultiple
                  opciones={opcionesVehiculos}
                  valor={form.vehiculosCandidatos}
                  onChange={(ids) => setForm((f) => ({ ...f, vehiculosCandidatos: ids }))}
                  avisos={hayConsulta ? avisos.vehiculos : {}}
                  placeholder="Buscar vehículo…"
                />
              </FormField>
            </div>
          </>
        ) : (
          <>
            <FormField id="choferId" label="Chofer" error={errores.choferId} required>
              <select name="choferId" value={form.choferId} onChange={handleChange}>
                <option value="">Seleccionar…</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="vehiculoId" label="Vehículo" error={errores.vehiculoId} required>
              <select name="vehiculoId" value={form.vehiculoId} onChange={handleChange}>
                <option value="">Seleccionar…</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.numeroInterno} - {v.dominio}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        )}

        <CampoKmEstimados
          valor={form.kilometrosEstimados}
          onChange={handleChange}
          requerido={requiereOperativos}
          errorValidacion={errores.kilometrosEstimados}
          errorCalculo={errorKmVigente}
          onUbicar={setUbicando}
          puedeCalcular={puedeCalcular}
          calculando={calculandoKm}
          onCalcular={handleCalcularKm}
          estimacion={
            estimacion && { resultado: estimacion.resultado, desactualizado: estimacion.firma !== firmaActual }
          }
        />

        {ubicando && (
          <PasoUbicarEnMapa
            nombre={ubicando.nombre}
            textoConfirmar="Guardar ubicación"
            onConfirmar={handleUbicarFaltante}
            onCancelar={() => setUbicando(null)}
          />
        )}

        <FormField id="cantidadPasajeros" label="Cantidad de pasajeros" error={errores.cantidadPasajeros}>
          <input
            type="number"
            name="cantidadPasajeros"
            min="1"
            step="1"
            value={form.cantidadPasajeros}
            onChange={handleChange}
          />
        </FormField>

      </div>

      {errores.general && <Alert variant="error">{errores.general}</Alert>}

      <div className="form-actions">
        <Button type="submit" variant="primary" loading={enviando}>
          {enviando ? textoEnviando : textoBoton}
        </Button>
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

export default ViajeForm;
