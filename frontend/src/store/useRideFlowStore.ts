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

/** Propuesta de viaje enviada por un conductor */
export interface Bid {
  _id: string;
  driver: {
    _id: string;
    name: string;
    avatarUrl?: string;
    avgRating?: number;
    totalRatings?: number;
    vehicle?: {
      make?: string;
      model?: string;
      licensePlate?: string;
      color?: string;
    };
  };
  price: number;
  estimatedTime: number; // minutos estimados hasta el pickup
  currency?: string;
}

/** Payload de un viaje activo una vez aceptado */
export interface ActiveRide {
  _id: string;
  passengerId: string;
  driverId: string;
  origin: { latitude: number; longitude: number; address?: string };
  destination: { latitude: number; longitude: number; address?: string };
  status: string;
  price?: number;
  currency?: string;
  acceptedBid?: Bid;
}

interface RideFlowState {
    status: RideStatus;
    rideId: string | null;
    bids: Bid[];
    activeRidePayload: ActiveRide | null;
    paymentMethod: 'CASH' | 'CARD' | 'APPLE_PAY' | 'WALLET';
    
    // Actions
    setStatus: (status: RideStatus) => void;
    setRideContext: (rideId: string) => void;
    receiveBid: (bid: Bid) => void;
    acceptBid: () => void;
    setActiveRide: (ride: ActiveRide) => void;
    setPaymentMethod: (method: 'CASH' | 'CARD' | 'APPLE_PAY' | 'WALLET') => void;
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

    setActiveRide: (ride) => set({ activeRidePayload: ride }),

    setPaymentMethod: (method) => set({ paymentMethod: method }),

    resetFlow: () => set({ 
        status: 'IDLE', 
        rideId: null, 
        bids: [], 
        activeRidePayload: null,
        paymentMethod: 'CASH'
    }),
}));
