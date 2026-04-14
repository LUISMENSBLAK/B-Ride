const User = require('../models/User');

class LocationCacheService {
    constructor() {
        // Estructura: driverId => { lng, lat, timestamp }
        this.cache = new Map();
        this.isFlushing = false;
    }

    /**
     * @desc Registra O(1) la ubicación en RAM
     */
    updateLocation(driverId, lng, lat) {
        if (!driverId) return;
        this.cache.set(driverId.toString(), {
            lng,
            lat,
            timestamp: Date.now()
        });
    }

    /**
     * @desc Vacía memoria asíncronamente y empaqueta BulkQueries para MongoDB
     */
    async flushToDatabase() {
        if (this.isFlushing || this.cache.size === 0) return;
        this.isFlushing = true;

        try {
            // Snapshot atómico para liberar lock
            const snapshot = new Map(this.cache);
            this.cache.clear();

            const bulkOps = [];
            for (let [driverId, data] of snapshot.entries()) {
                 bulkOps.push({
                     updateOne: {
                         filter: { _id: driverId },
                         update: {
                             $set: {
                                 'lastKnownLocation.coordinates': [data.lng, data.lat],
                             }
                         }
                     }
                 });
            }

            if (bulkOps.length > 0) {
                 await User.bulkWrite(bulkOps, { ordered: false });

            }

        } catch (e) {
            console.error('[LocationCache] Critical error flusheando datos a Mongo:', e.message);
        } finally {
            this.isFlushing = false;
        }
    }
}

module.exports = new LocationCacheService();
