import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { Platform } from 'react-native';

// Simulador iOS  → localhost
// Emulador Android → 10.0.2.2
// Dispositivo físico → EXPO_PUBLIC_SOCKET_URL en .env
const defaultSocketURL =
  Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || defaultSocketURL;

// CORRECCIÓN 4: Warning claro si la URL de socket no está definida
if (!process.env.EXPO_PUBLIC_SOCKET_URL) {
    console.warn(
        '[Socket] ⚠️ EXPO_PUBLIC_SOCKET_URL no está definida. ' +
        'Usando fallback a ' + defaultSocketURL + '. ' +
        'En producción configúrala con: eas secret:create --name EXPO_PUBLIC_SOCKET_URL --value https://tu-backend.railway.app'
    );
}

// BUG 8: Ubicación conocida para re-emisión tras reconexiones (BUG 10)
let _lastKnownDriverLocation: { lat: number; lng: number } | null = null;

class SocketService {
  private socket: Socket | null = null;
  private currentRideId: string | null = null;

  connect() {
    if (this.socket?.connected) {
        return;
    }

    const user = useAuthStore.getState().user;
    const token = user?.accessToken; 
    
    if (!token) return;

    // BUG 8 FIX: Warning visible si la URL apunta a localhost/emulador en un entorno real
    if (SOCKET_URL.includes('localhost') || SOCKET_URL.includes('10.0.2.2')) {
      console.warn('[Socket] ⚠️ URL contiene localhost/10.0.2.2. En dispositivos físicos define EXPO_PUBLIC_SOCKET_URL en .env');
    }
    
    if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      extraHeaders: {
        Authorization: `Bearer ${token}`
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // REBIND EVENT MANAGER AL NUEVO SOCKET QUE SE ACABA DE CREAR
    const eventManager = require('./EventManager').default;
    eventManager.reconnectSocketBindings();

    this.socket.on('connect', () => {
      console.log('[Socket] Connected / Reconnected:', this.socket?.id);
      const userState = useAuthStore.getState().user;
      if (userState) {
        this.socket?.emit('join', userState._id);
        
        // Re-join dynamic room if active
        if (this.currentRideId) {
             this.socket?.emit('join_ride_room', this.currentRideId);
        }

        // BUG 10 FIX: Re-emitir driver:join tras reconexión si es conductor y hay ubicación conocida
        if (userState.role === 'DRIVER' && _lastKnownDriverLocation) {
          this.socket?.emit('driver:join', _lastKnownDriverLocation);
          console.log('[Socket] Re-emitted driver:join tras reconexión');
        }
        
        // WEBSOCKETS RECOVERY: Pedimos el active ride state
        this.socket?.emit('sync_state', { userId: userState._id, role: userState.role }, (res: any) => {
            if (res && res.success && res.activeRide) {
                // Notificar componente global del recargue (si hay uno)
                console.log('[Socket] Estado activo recuperado:', res.activeRide._id);
                const eventManager = require('./EventManager').default;
                eventManager.emitLocalRideEvent('trip_state_changed', res.activeRide);
            }
        });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err);
    });
  }

  setRideRoom(rideId: string | null) {
      this.currentRideId = rideId;
      if (rideId && this.socket?.connected) {
          this.socket.emit('join_ride_room', rideId);
      }
  }

  /**
   * Envía un evento al servidor garantizando la recepción vía ACK.
   * Tolerancia táctica: Si en X milisegundos no hay respuesta, reintenta (idempotente).
   */
  async emitWithAck(eventName: string, payload: any, maxRetries = 3, timeoutMs = 3000): Promise<any> {
    if (!this.socket?.connected) throw new Error('Socket no conectado');

    // Inyectar unique eventId for Backend Idempotency
    const securedPayload = { ...payload, eventId: payload.eventId || uuidv4() };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
           const response = await this.socket.timeout(timeoutMs).emitWithAck(eventName, securedPayload);
           
           if (response && response.success === false) {
               throw new Error(response.error || 'Validation failed on node');
           }
           
           if (response && response.status === 'duplicate_ignored') {
               console.log(`[Socket] ACK: Server Ignored Duplicate (${eventName})`);
           }
           
           return response; // Success Validation
       } catch (error: any) {
           console.warn(`[Socket] ACK Timeout en ${eventName} (Intento ${attempt}/${maxRetries}):`, error.message);
           if (attempt === maxRetries) {
               throw new Error(`Fallo de red tras ${maxRetries} reintentos en ${eventName}`);
           }
       }
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('Force closing socket cleanly...');
      this.socket.removeAllListeners(); 
      this.socket.disconnect();
      this.socket = null;
      this.currentRideId = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  // BUG 10: Permite a DriverDashboard guardar la ubicación para re-emisión tras reconexión
  setLastKnownDriverLocation(lat: number, lng: number) {
    _lastKnownDriverLocation = { lat, lng };
  }
}

export default new SocketService();
