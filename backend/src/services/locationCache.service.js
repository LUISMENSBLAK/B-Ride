const User = require('../models/User');
const NodeCache = require('node-cache');

class LocationCacheService {
    constructor() {
        // Cache con TTL de 10 minutos (600s), chequea expiración cada 2 mins
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
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
        if (this.isFlushing || this.cache.keys().length === 0) return;
        this.isFlushing = true;

        try {
            // Snapshot atómico para liberar lock
            const snapshot = this.cache.mget(this.cache.keys());
            this.cache.flushAll(); // Limpia la instancia de node-cache


            const bulkOps = [];
            for (let [driverId, data] of Object.entries(snapshot)) {
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
