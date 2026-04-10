import client from './client';

export const syncRideState = async (rideId: string) => {
    try {
        const response = await client.get(`/rides/${rideId}/state`);
        return response.data.data; // { status, version, driver, selectedBid }
    } catch (error) {
        console.error('[Sync] Error syncing ride state:', error);
        return null;
    }
};
