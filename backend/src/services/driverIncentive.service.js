const User = require('../models/User');
const { getIO } = require('../sockets');

class DriverIncentiveService {
    constructor() {
        // Formato Histórico { zoneId: { status: 'NORMAL|HIGH|CRITICAL', surge: X, demand: Y } }
        this.cacheHistory = new Map();
    }

    /**
     * Parsing of Raw Strings => { lat, lng }
     */
    crackZoneId(zoneId) {
        const parts = zoneId.split('_');
        if (parts.length === 2) {
            return {
                 lat: parseFloat(parts[0]),
                 lng: parseFloat(parts[1])
            };
        }
        return { lat: 0, lng: 0 };
    }

    /**
     * Hook Engine asíncrono lanzado por pricing.service cada 15s.
     */
    async updateHeatZones(surgeCache, demandByZone, supplyByZone) {
        const nextZonesPayload = [];
        let mapHasSignificantChanges = false;

        // Limpieza y categorización
        for (let [zoneId, surgeMultiplier] of surgeCache.entries()) {
             const demand = demandByZone.get(zoneId) || 0;
             const supply = supplyByZone.get(zId => supplyByZone.get(zId)) || 0; // Fix small bug from demand count
             const realSupply = supplyByZone.get(zoneId) || 0;

             let tierStatus = 'NORMAL';
             if (surgeMultiplier > 1.2 && demand > realSupply) tierStatus = 'HIGH_DEMAND';
             if (surgeMultiplier > 1.8 && demand > realSupply * 2) tierStatus = 'CRITICAL';

             // Si la zona no es normal o tiene demanda, inyectar a radar
             if (tierStatus !== 'NORMAL' || surgeMultiplier > 1.0) {
                  nextZonesPayload.push({
                       zoneId,
                       surgeMultiplier,
                       demandLevel: tierStatus,
                       recommendedArea: this.crackZoneId(zoneId)
                  });
             }

             // Anti-Spam Check vs Previous State
             const hist = this.cacheHistory.get(zoneId);
             if (!hist || hist.status !== tierStatus || Math.abs(hist.surge - surgeMultiplier) > 0.1) {
                  mapHasSignificantChanges = true;
             }
        }

        // Renovar Historial
        this.cacheHistory.clear();
        nextZonesPayload.forEach(z => {
             this.cacheHistory.set(z.zoneId, { status: z.demandLevel, surge: z.surgeMultiplier, demand: z.demandLevel });
        });

        // Broadcast a Drivers Activos si Hubo Cambios Reales
        if (mapHasSignificantChanges && nextZonesPayload.length > 0) {
             const io = getIO();
             if (io) {
                 this.dispatchToAvailableDrivers(nextZonesPayload, io);
             }
        }
    }

    /**
     * Enviar eventos usando Geo-Routing (Complejidad Analítica O(Z) en Node)
     */
    async dispatchToAvailableDrivers(zonesPayload, io) {
        try {
            // Emisión instantánea por Geohash (Omitiendo O(N*M) iteraciones y Mongo Scans)
            zonesPayload.forEach(zone => {
                 const geoRoom = `geo_${zone.zoneId}`;
                 io.to(geoRoom).emit('heat_zone_update', { zone });
            });
        } catch (e) {
            console.error('[Incentives] Fallo despachando Hot Zones O(Z):', e.message);
        }
    }

    /**
     * Endpoint API
     */
    getGlobalHeatZones() {
        const payload = [];
        this.cacheHistory.forEach((val, key) => {
             if (val.status !== 'NORMAL' || val.surge > 1.0) {
                 payload.push({
                     zoneId: key,
                     surgeMultiplier: val.surge,
                     demandLevel: val.status,
                     recommendedArea: this.crackZoneId(key)
                 });
             }
        });
        return payload;
    }
}

module.exports = new DriverIncentiveService();
