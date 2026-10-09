import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Alert from './ui/Alert';
import SelectorBuscarOCrear from './ui/SelectorBuscarOCrear';
import SelectorMultiple from './ui/SelectorMultiple';
import EditorRecorrido from './EditorRecorrido';
import SeccionDatosAdministrativos from './SeccionDatosAdministrativos';
import { consultarDisponibilidad } from '../services/viajesApi';
import { nombreChofer, nombreVehiculo } from '../utils/viajeFormato';
import { errorDeSecuencia, paradasAPayload } from '../utils/paradas';
import { ordenarPorInterno } from '../utils/vehiculos';
import {
  CAMPOS_ADMINISTRATIVOS,
  VALORES_ADMIN_VACIOS,
  hayDatosAdministrativos,
  useCatalogosPago,
  validarMontos,
  valoresAPayload,
} from '../utils/datosAdministrativos';

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
// `conDatosAdministrativos` agrega la sección colapsada de datos
// administrativos (solo alta y solo para Administrador/Encargado: lo decide
// quien monta el formulario). Si la sección queda vacía, no se manda nada; si
// tiene datos, viajan en `datosAdministrativos` dentro del mismo POST, así el
// viaje se crea completo o no se crea.
function ViajeForm({
  valoresIniciales,
  estadoActual,
  onSubmit,
  textoBoton,
  textoEnviando,
  onCancelar,
  conDatosAdministrativos = false,
  candidatosActuales,
}) {
  const [choferes, setChoferes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState(valoresIniciales || FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [administrativos, setAdministrativos] = useState(VALORES_ADMIN_VACIOS);
  const [seccionAbierta, setSeccionAbierta] = useState(false);
  const [avisos, setAvisos] = useState(SIN_AVISOS);
  const { estadosPago, metodosPago, cargarCatalogos } = useCatalogosPago();

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

  function handleChangeAdministrativo(e) {
    const { name, value } = e.target;
    setAdministrativos((a) => ({ ...a, [name]: value }));
  }

  function handleToggleSeccion(abierta) {
    setSeccionAbierta(abierta);
    // Los catálogos se piden la primera vez que se abre: quien no la abre no
    // los necesita.
    if (abierta) cargarCatalogos();
  }

  // Si hay un error adentro de la sección colapsada, se abre para que se vea.
  function mostrarErrores(nuevos) {
    setErrores(nuevos);
    if (CAMPOS_ADMINISTRATIVOS.some((campo) => nuevos[campo])) {
      handleToggleSeccion(true);
    }
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
    if (conDatosAdministrativos) {
      Object.assign(erroresLocales, validarMontos(administrativos));
    }
    if (Object.keys(erroresLocales).length > 0) {
      mostrarErrores(erroresLocales);
      return;
    }

    setEnviando(true);
    try {
      const enviarAdministrativos = conDatosAdministrativos && hayDatosAdministrativos(administrativos);
      const { choferId, vehiculoId, choferesCandidatos, vehiculosCandidatos, paradas: filasParadas, ...resto } = form;
      const asignacion = usaCandidatos ? { choferesCandidatos, vehiculosCandidatos } : { choferId, vehiculoId };
      await onSubmit({
        ...resto,
        ...asignacion,
        // Solo ids, en orden: el `orden` lo asigna el backend. No hay filas vacías
        // (ya se frenó el envío arriba).
        paradas: paradasAPayload(filasParadas).ids,
        ...(enviarAdministrativos ? { datosAdministrativos: valoresAPayload(administrativos) } : {}),
      });
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errores) {
        mostrarErrores(err.response.data.errores);
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

        <FormField
          id="kilometrosEstimados"
          label="Kilómetros estimados"
          error={errores.kilometrosEstimados}
          required={requiereOperativos}
        >
          <input
            type="number"
            name="kilometrosEstimados"
            value={form.kilometrosEstimados}
            onChange={handleChange}
          />
        </FormField>

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

        {conDatosAdministrativos && (
          <SeccionDatosAdministrativos
            valores={administrativos}
            errores={errores}
            estadosPago={estadosPago}
            metodosPago={metodosPago}
            abierta={seccionAbierta}
            onToggle={handleToggleSeccion}
            onChange={handleChangeAdministrativo}
          />
        )}
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
