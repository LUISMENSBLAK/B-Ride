/// <reference types="node" />
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/useSocketStore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import eventManager from './EventManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { Platform } from 'react-native';

// Simulador iOS  → localhost
// Emulador Android → 10.0.2.2
// Dispositivo físico → EXPO_PUBLIC_SOCKET_URL en .env
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://b-ride-production.up.railway.app';

if (!process.env.EXPO_PUBLIC_SOCKET_URL) {
    console.warn(
        '[Socket] ⚠️ EXPO_PUBLIC_SOCKET_URL no está definida. ' +
        'Usando fallback a ' + SOCKET_URL + '. ' +
        'En producción configúrala con: eas secret:create --name EXPO_PUBLIC_SOCKET_URL --value https://tu-backend.railway.app'
    );
}

// BUG 8: Ubicación conocida para re-emisión tras reconexiones
let _lastKnownDriverLocation: { lat: number; lng: number } | null = null;

// ─── Helper: refresca el accessToken si ha expirado ─────────────────────────
async function refreshTokenIfNeeded(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    // Decodificar payload del JWT sin verificar firma — compatible RN/Hermes
    const parts = token.split('.');
    if (parts.length !== 3) return token;
    // Buffer está disponible en RN via react-native-get-random-values / Hermes
    let payload: any = {};
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    } catch {
      return token; // Si no podemos decodificar, asumimos válido
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp && payload.exp < nowSec;

    if (!isExpired) return token;

    if (__DEV__) console.log('[Socket] accessToken expirado — intentando refresh...');

    const refreshToken = await AsyncStorage.getItem('refreshToken');
    if (!refreshToken) {
      if (__DEV__) console.warn('[Socket] No hay refreshToken. Cerrando sesión.');
      useAuthStore.getState().logout();
      return null;
    }

    const baseURL = process.env.EXPO_PUBLIC_API_URL ||
      (Platform.OS === 'android'
        ? 'https://b-ride-production.up.railway.app/api'
        : 'https://b-ride-production.up.railway.app/api');

    const res = await axios.post(`${baseURL}/auth/refresh`, { token: refreshToken });
    if (res.data?.success && res.data?.accessToken) {
      const newAccess = res.data.accessToken;
      const newRefresh = res.data.refreshToken;
      await AsyncStorage.setItem('userToken', newAccess);
      if (newRefresh) await AsyncStorage.setItem('refreshToken', newRefresh);
      useAuthStore.getState().updateUser({
        accessToken: newAccess,
        ...(newRefresh && { refreshToken: newRefresh }),
      });
      if (__DEV__) console.log('[Socket] Token refrescado correctamente.');
      return newAccess;
    }

    if (__DEV__) console.warn('[Socket] Refresh falló. Cerrando sesión.');
    useAuthStore.getState().logout();
    return null;
  } catch (err) {
    if (__DEV__) console.warn('[Socket] Error en refreshTokenIfNeeded:', err);
    return null;
  }
}

class SocketService {
  private socket: Socket | null = null;
  private currentRideId: string | null = null;
  private authErrorCount = 0;
  // FIX-1A: flag para evitar llamadas concurrentes a connect()
  private _isConnecting: boolean = false;

  async connect() {
    // FIX-1B: bloquear si ya conectado O si hay conexión en progreso
    if (this.socket?.connected || this._isConnecting) return;
    this._isConnecting = true;
    try {
      const user = useAuthStore.getState().user;
      if (!user) return;

      // Refrescar token ANTES de crear el socket — evita `jwt expired` en el primer intento
      const validToken = await refreshTokenIfNeeded();

      // DEBUG: verificar qué token se usa para conectar
      if (__DEV__) {
        console.log('[Socket] Token usado para conectar:',
          validToken ? validToken.substring(0, 20) + '...' : 'NULL');
      }

      if (!validToken) {
        console.warn('[Socket] No hay token válido, abortando conexión');
        return;
      }

      if (!SOCKET_URL) {
        console.warn('[Socket] No SOCKET_URL available');
      }

      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }

      this.socket = io(SOCKET_URL, {
        auth: { token: validToken },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 30000,
        timeout: 20000,
        secure: true,
        rejectUnauthorized: false,
      });

      eventManager.reconnectSocketBindings(this.socket);

      // Contadores scoped a esta invocación de connect() — declarados ANTES de todos los
      // handlers para evitar el Temporal Dead Zone de `let`
      let retryCount    = 0;
      const MAX_RETRIES  = 10;
      const getDelay = (attempt: number) => Math.min(2000 * Math.pow(2, attempt - 1), 30000);

      this.socket.on('reconnect_attempt', () => {
        useSocketStore.getState().setStatus('reconnecting');
        useSocketStore.getState().incrementReconnectAttempts();
      });

      this.socket.on('connect', () => {
        retryCount     = 0; // resetear backoff al conectar exitosamente
        this.authErrorCount = 0; // resetear contador de errores de auth
        useSocketStore.getState().setStatus('connected');
        useSocketStore.getState().resetReconnectAttempts();
        if (__DEV__) console.log('[Socket] Connected / Reconnected:', this.socket?.id);
        const userState = useAuthStore.getState().user;
        if (userState) {
          this.socket?.emit('join', userState._id);

          if (this.currentRideId) {
            this.socket?.emit('join_ride_room', this.currentRideId);
          }

          if (userState.role === 'DRIVER' && _lastKnownDriverLocation) {
            this.socket?.emit('driver:join', _lastKnownDriverLocation);
            if (__DEV__) console.log('[Socket] Re-emitted driver:join tras reconexión');
          }

          this.socket?.emit('sync_state', { userId: userState._id, role: userState.role }, (res: any) => {
            if (res && res.success && res.activeRide) {
              if (__DEV__) console.log('[Socket] Estado activo recuperado:', res.activeRide._id);
              eventManager.emitLocalRideEvent('trip_state_changed', res.activeRide);
            }
          });
        }
      });

      this.socket.on('disconnect', (reason) => {
        useSocketStore.getState().setStatus('disconnected');
        console.warn('[Socket] Disconnected:', reason);
      });

      // FIX-1D: connect_error con backoff silencioso en dev a partir del 3er intento
      this.socket.on('connect_error', async (err) => {
        useSocketStore.getState().setStatus('disconnected');
        retryCount++;

        const isAuthError =
          err.message?.includes('Authentication') ||
          err.message?.includes('Invalid token') ||
          err.message?.includes('jwt') ||
          err.message?.includes('Unauthorized') ||
          err.message?.includes('expired');

        // Logging inteligente: verboso los 2 primeros intentos, silencioso después
        if (__DEV__) {
          if (retryCount <= 2) {
            console.warn('[Socket] Connection error:', err.message);
          } else {
            const delay = getDelay(retryCount);
            console.log(`[Socket] Sin conexión. Reintentando en ${delay / 1000}s... (intento ${retryCount})`);
          }
        }

        // Error de autenticación → refrescar token o hacer logout
        if (isAuthError) {
          this.authErrorCount++;
          if (this.authErrorCount >= 2) {
            console.log('[Socket] Token inválido definitivamente. Cerrando sesión.');
            this.authErrorCount = 0;
            this.socket?.removeAllListeners();
            this.socket?.disconnect();
            this.socket = null;
            const { useAuthStore } = require('../store/authStore');
            useAuthStore.getState().logout();
            return;
          }
          refreshTokenIfNeeded().then((newToken) => {
            if (newToken) {
              this.socket?.disconnect();
              setTimeout(() => this.connect(), 500);
            } else {
              this.authErrorCount = 0;
              this.socket?.removeAllListeners();
              this.socket?.disconnect();
              this.socket = null;
              const { useAuthStore } = require('../store/authStore');
              useAuthStore.getState().logout();
            }
          });
          return;
        }

        // Límite de reintentos alcanzado
        if (retryCount >= MAX_RETRIES) {
          if (__DEV__) console.log('[Socket] Máximo de reintentos alcanzado. Esperando acción del usuario.');
        }
      });
    } finally {
      // FIX-1B: liberar el flag independientemente del resultado
      this._isConnecting = false;
    }
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
               if (__DEV__) console.log(`[Socket] ACK: Server Ignored Duplicate (${eventName})`);
           }
           
           return response; // Success Validation
       } catch (error: unknown) {
           const msg = error instanceof Error ? error.message : String(error);
           console.warn(`[Socket] ACK Timeout en ${eventName} (Intento ${attempt}/${maxRetries}):`, msg);
           if (attempt === maxRetries) {
               throw new Error(`Fallo de red tras ${maxRetries} reintentos en ${eventName}`);
           }
       }
    }
  }

  disconnect() {
    if (this.socket) {
      if (__DEV__) console.log('Force closing socket cleanly...');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.currentRideId = null;
    }
  }

  // FIX-1F: reset público para llamar en logout — limpia todo
  reset() {
    this.disconnect();
    this.currentRideId = null;
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
