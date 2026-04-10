import { useRef, useEffect, useState } from 'react';
import { MapRendererHandle } from '../components/MapRenderer';

export function useDriverTracking(mapRef: React.RefObject<MapRendererHandle | null>) {
  const [driverTrackingState, setDriverTrackingState] = useState<'IDLE' | 'TRACKING' | 'RECONNECTING'>('IDLE');
  const lastHeartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (lastHeartbeatTimer.current) clearTimeout(lastHeartbeatTimer.current);
    };
  }, []);

  const pushLocation = (lat: number, lng: number) => {
    // Inject the raw location. Because we're using Native Driver `animateMarkerToCoordinate`
    // inside MapRenderer, it natively lerps for 1000ms. We don't need JS thread looping.
    if (mapRef.current) {
        mapRef.current.updateDriverPosition(lat, lng);
    }
    
    // Manage Heartbeat and Watchdog
    setDriverTrackingState('TRACKING');
    
    if (lastHeartbeatTimer.current) {
      clearTimeout(lastHeartbeatTimer.current);
    }
    
    lastHeartbeatTimer.current = setTimeout(() => {
        // Limit: 5000ms passed without a single ping -> Reconnecting.
        setDriverTrackingState('RECONNECTING');
    }, 5000);
  };

  const stopTracking = () => {
    if (lastHeartbeatTimer.current) clearTimeout(lastHeartbeatTimer.current);
    setDriverTrackingState('IDLE');
  };

  return {
    driverTrackingState,
    pushLocation,
    stopTracking
  };
}
