import { useEffect } from 'react';
import socketService from './socket';

class EventManager {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private processedEvents: Set<string> = new Set();
  private eventQueue: string[] = [];
  private MAX_PROCESSED_EVENTS = 100;

  constructor() {
    // Escuchar universalmente desde el socket singleton
    // NOTA: Se ha removido el fetching directo de socketService.getSocket()
    // para evitar la dependencia circular (Error: Cannot read property 'getSocket' of undefined).
    // Ahora, explícitamente se suscribe mediante reconnectSocketBindings()
  }

  reconnectSocketBindings(socketInstance: any) {
      if (socketInstance) {
          socketInstance.offAny();
          socketInstance.onAny((eventName: string, ...args: any[]) => {
             this.dispatch(eventName, ...args);
          });
      }
  }

  subscribe(eventName: string, callback: (...args: any[]) => void) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)?.push(callback);

    // Permitir desencadenar limpieza devolviendo un un-sub
    return () => this.unsubscribe(eventName, callback);
  }

  unsubscribe(eventName: string, callback: (...args: any[]) => void) {
    const list = this.listeners.get(eventName);
    if (list) {
      this.listeners.set(eventName, list.filter(cb => cb !== callback));
    }
  }

  dispatch(eventName: string, ...args: any[]) {
    // Check para Idempotencia basada en EventID de Backend (si lo tiene)
    const payload = args[0];
    if (payload && typeof payload === 'object' && payload.eventId) {
        if (this.processedEvents.has(payload.eventId)) {
            if (__DEV__) console.log(`[EventManager] Ignorando evento repetido en Frontend: ${payload.eventId}`);
            return;
        }
        
        // Registrar Evento en Caché local
        this.processedEvents.add(payload.eventId);
        this.eventQueue.push(payload.eventId);
        
        if (this.eventQueue.length > this.MAX_PROCESSED_EVENTS) {
            const oldest = this.eventQueue.shift();
            if (oldest) this.processedEvents.delete(oldest);
        }
    }

    const list = this.listeners.get(eventName);
    if (list) {
      list.forEach(cb => cb(...args));
    }
  }

  /**
   * Emite un evento localmente (sin pasar por socket) para recovery y testing.
   */
  emitLocalRideEvent(eventName: string, ...args: any[]) {
    this.dispatch(eventName, ...args);
  }
}

const eventManager = new EventManager();

// --- REACT HOOK DEFINITIVO PARA SOCKET EVENTS ---
export function useRideSocketEvent(eventName: string, callback: (...args: any[]) => void) {
  useEffect(() => {
    const unsubscribe = eventManager.subscribe(eventName, callback);
    return () => {
      unsubscribe();
    };
  }, [eventName, callback]); // callback suele ser useCallback
}

export default eventManager;
