import { create } from 'zustand';

export type SocketStatus = 'connected' | 'reconnecting' | 'disconnected';

interface SocketState {
  status: SocketStatus;
  reconnectAttempts: number;
  lastConnectedAt: number | null;

  setStatus: (status: SocketStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  lastConnectedAt: null,

  setStatus: (status) =>
    set((state) => ({
      status,
      lastConnectedAt: status === 'connected' ? Date.now() : state.lastConnectedAt,
    })),

  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),

  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}));
