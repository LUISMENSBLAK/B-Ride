export interface LocationPoint {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface UserProfile {
  _id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  avgRating?: number;
  totalRatings?: number;
  role?: string;
  vehicle?: {
    brand: string;
    model: string;
    year: string;
    plates: string;
    color: string;
  };
}

export interface RideData {
  _id: string;
  passenger: string | UserProfile;
  driver?: string | UserProfile;
  status: 'REQUESTED' | 'NEGOTIATING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pickupLocation: LocationPoint;
  dropoffLocation: LocationPoint;
  proposedPrice: number;
  finalPrice?: number;
  currency: string;
  vehicleCategory?: string;
  distanceKm?: number;
  estimatedTimeMin?: number;
  paymentMethod: 'CASH' | 'CARD';
  paymentStatus?: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  securityCode?: string;
  createdAt: string;
}

export interface BidData {
  _id: string;
  rideId: string;
  driver: UserProfile;
  price: number;
  currency: string;
  eta: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}
