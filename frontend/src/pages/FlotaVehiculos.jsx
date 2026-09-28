import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

function FlotaVehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/vehiculos')
      .then(({ data }) => setVehiculos(data.vehiculos))
      .finally(() => setCargando(false));
  }, []);

  return (
    <main>
      <p>
        <Link to="/">Volver</Link>
      </p>
      <h1>Flota de vehículos</h1>
      {cargando && <p>Cargando…</p>}
      {!cargando && vehiculos.length === 0 && <p>No se encontraron vehículos</p>}
      {!cargando && vehiculos.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Dominio</th>
              <th>Interno</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Kilometraje</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => (
              <tr key={v.id}>
                <td>{v.dominio}</td>
                <td>{v.numeroInterno}</td>
                <td>{v.marca}</td>
                <td>{v.modelo}</td>
                <td>{v.kilometraje}</td>
                <td>{v.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

export default FlotaVehiculos;
