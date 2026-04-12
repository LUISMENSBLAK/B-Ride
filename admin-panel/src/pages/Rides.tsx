import { useEffect, useState } from 'react';
import apiClient from '../api/client';

export default function RidesPage() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRides();
  }, []);

  const fetchRides = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/rides');
      setRides(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Visor de Viajes</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ padding: 12 }}>ID</th>
            <th style={{ padding: 12 }}>Pasajero</th>
            <th style={{ padding: 12 }}>Conductor</th>
            <th style={{ padding: 12 }}>Precio</th>
            <th style={{ padding: 12 }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((ride: any) => (
            <tr key={ride._id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: 12 }}>{ride._id.slice(-6)}</td>
              <td style={{ padding: 12 }}>{ride.passenger?.name || 'N/A'}</td>
              <td style={{ padding: 12 }}>{ride.driver?.name || '---'}</td>
              <td style={{ padding: 12 }}>${ride.fare}</td>
              <td style={{ padding: 12 }}>
                <span style={{ 
                  background: ride.status === 'COMPLETED' ? '#0f4c2e' : '#593e0b',
                  padding: '4px 8px', borderRadius: 12, fontSize: 12
                }}>
                  {ride.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
