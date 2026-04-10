import { create } from 'zustand';

export type RideStatus =
  | 'IDLE'
  | 'SEARCHING'
  | 'NEGOTIATING'
  | 'MAPPED'
  | 'ACTIVE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ACCEPTED'
  | 'REQUESTING'
  | 'REQUESTED';

interface RideFlowState {
    status: RideStatus;
    rideId: string | null;
    bids: any[];
    activeRidePayload: any; // Para guardar datos del viaje en curso
    paymentMethod: 'CASH' | 'CARD' | 'APPLE_PAY';
    
    // Actions
    setStatus: (status: RideStatus) => void;
    setRideContext: (rideId: string) => void;
    receiveBid: (bid: any) => void;
    acceptBid: () => void;
    setActiveRide: (ride: any) => void;
    resetFlow: () => void;
}

export const useRideFlowStore = create<RideFlowState>((set, get) => ({
    status: 'IDLE',
    rideId: null,
    bids: [],
    activeRidePayload: null,
    paymentMethod: 'CASH',

    setStatus: (status) => set({ status }),
    
    setRideContext: (rideId) => set({ rideId, status: 'SEARCHING' }),
    
    receiveBid: (bid) => {
        const currentBids = get().bids;
        // Evita duplicados por ID de bid, pero si es el mismo driver, actualiza su puja
        const existingIndex = currentBids.findIndex(b => b.driver?._id === bid.driver?._id || b._id === bid._id);
        
        if (existingIndex >= 0) {
            const newBids = [...currentBids];
            newBids[existingIndex] = bid;
            set({ bids: newBids, status: 'NEGOTIATING' });
        } else {
            set({ bids: [...currentBids, bid], status: 'NEGOTIATING' });
        }
    },

    acceptBid: () => set({ status: 'MAPPED' }),

    setActiveRide: (ride) => set({ activeRidePayload: ride }), // status lo setea el handler explícitamente

    resetFlow: () => set({ 
        status: 'IDLE', 
        rideId: null, 
        bids: [], 
        activeRidePayload: null,
        paymentMethod: 'CASH'
    }),
}));
