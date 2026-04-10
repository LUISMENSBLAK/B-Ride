const User = require('../models/User');
const Ride = require('../models/Ride');

class PricingService {
    constructor() {
        // Configuraciones escalables (fallback de Env)
        this.BASE_FARE_PER_KM = parseFloat(process.env.BASE_FARE_PER_KM) || 1.20;
        this.MIN_FARE = parseFloat(process.env.MIN_FARE) || 2.50;
        this.MAX_SURGE = parseFloat(process.env.MAX_SURGE) || 2.5;

        // Geopartitioning Truncation factor: `Math.floor(x * 50) / 50` ~= Grid de 2.22 km
        this.GRID_FACTOR = 50; 

        // Cache in-memory temporal: { "zoneId": multiplier }
        this.surgeCache = new Map();
        
        // Cache Crudo de Inteligencia para modulo Heat Zones
        this.rawDemandMap = new Map();
        this.rawSupplyMap = new Map();

        // Arrancar Cron Engine Interno
        setInterval(() => {
            this.calculateMarketState().catch(e => console.error('[Pricing] Crash cron:', e.message));
        }, 15000);
    }

    /**
     * @desc Convierte Lat/Long a un CellID agrupador
     */
    getZoneId(lat, lng) {
        const trLat = Math.round(lat * this.GRID_FACTOR) / this.GRID_FACTOR;
        const trLng = Math.round(lng * this.GRID_FACTOR) / this.GRID_FACTOR;
        return `${trLat}_${trLng}`;
    }

    /**
     * @desc Job Periódico (15s) calcula balance Oferta/Demanda
     */
    async calculateMarketState() {
        // 1. Snapshot de rides en demanda activa
        const openRides = await Ride.find({ status: { $in: ['REQUESTED', 'NEGOTIATING'] } })
                                    .select('pickupLocation');

        // 2. Snapshot de Drivers Disponibles
        const availableDrivers = await User.find({ role: 'DRIVER', driverStatus: 'AVAILABLE' })
                                          .select('lastKnownLocation');

        const demandByZone = new Map(); // ZoneId -> count
        const supplyByZone = new Map(); // ZoneId -> count

        // Rellenar Demand
        openRides.forEach(ride => {
            if (!ride.pickupLocation || !ride.pickupLocation.coordinates) return;
            const zId = this.getZoneId(ride.pickupLocation.coordinates[1], ride.pickupLocation.coordinates[0]);
            demandByZone.set(zId, (demandByZone.get(zId) || 0) + 1);
        });

        // Rellenar Supply
        availableDrivers.forEach(driver => {
            if (!driver.lastKnownLocation || !driver.lastKnownLocation.coordinates) return;
            const zId = this.getZoneId(driver.lastKnownLocation.coordinates[1], driver.lastKnownLocation.coordinates[0]);
            supplyByZone.set(zId, (supplyByZone.get(zId) || 0) + 1);
        });

        // Generar Multipliers
        const nextDict = new Map();
        
        for (let [zId, demandCount] of demandByZone.entries()) {
            const supplyCount = supplyByZone.get(zId) || 0;
            // Formula Mestra: raw = demand / max(supply, 1)
            const rawRate = demandCount / Math.max(supplyCount, 1);
            
            // Normalize al umbral inferior
            let newSurgeTarget = Math.max(1.0, rawRate);
            
            // Limitador superior para evitar hyper-inflación
            if (newSurgeTarget > this.MAX_SURGE) newSurgeTarget = this.MAX_SURGE;

            // Simple Moving Average (SMA) sobre Cache vieja para evitar saltos violentos
            const oldSurge = this.surgeCache.get(zId) || 1.0;
            const smoothedSurge = (newSurgeTarget * 0.3) + (oldSurge * 0.7);

            nextDict.set(zId, Math.round(smoothedSurge * 100) / 100);
        }

        // Limpiar zonas apagadas (Si un driver existe pero no demmand) -> Drop gradually
        for (let [zId, oldSurge] of this.surgeCache.entries()) {
             if (!demandByZone.has(zId) && oldSurge > 1.0) {
                  // Decaimiento natural hacia 1.0
                  const decayedSurge = Math.max(1.0, oldSurge - 0.1);
                  nextDict.set(zId, Math.round(decayedSurge * 100) / 100);
             }
        }

        this.surgeCache = nextDict;
        this.rawDemandMap = demandByZone;
        this.rawSupplyMap = supplyByZone;

        // Invocamos actualización de Heat Zones tras este cómputo (Desacoplado silencioso)
        try {
             require('./driverIncentive.service').updateHeatZones(this.surgeCache, this.rawDemandMap, this.rawSupplyMap);
        } catch(e) {
             // Silently ignore till service boots initialized
        }
    }

    /**
     * @desc Obtención rápida estática O(1)
     */
    getSurgeForLocation(lat, lng) {
        const baseSurge = 1.0;
        if (!lat || !lng) return baseSurge;
        
        const zoneId = this.getZoneId(lat, lng);
        const activeSurge = this.surgeCache.get(zoneId) || baseSurge;
        return { surgeMultiplier: activeSurge, zoneId };
    }

    /**
     * @desc Cálculo y Estimación completa entre dos puntos
     */
    estimateRide(pickupLat, pickupLng, dropoffLat, dropoffLng) {
        // Haversine simplificado local
        const R = 6371; // radio Tierra km
        const dLat = (dropoffLat - pickupLat) * Math.PI / 180;
        const dLng = (dropoffLng - pickupLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(pickupLat * Math.PI / 180) * Math.cos(dropoffLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        
        const distanceKm = Math.max((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))), 0.5); // Minimo historico de calculo

        const basePrice = Math.max(this.MIN_FARE, distanceKm * this.BASE_FARE_PER_KM);
        const { surgeMultiplier, zoneId } = this.getSurgeForLocation(pickupLat, pickupLng);

        let finalPrice = basePrice * surgeMultiplier;

        // Limpieza decimals
        finalPrice = Math.round(finalPrice * 10) / 10;

        return {
            recommendedPrice: finalPrice,
            basePrice: Math.round(basePrice * 10) / 10,
            surgeMultiplier,
            highDemand: surgeMultiplier >= 1.25,
            zoneId,
            distanceEstimatedKm: Math.round(distanceKm * 10) / 10
        };
    }
}

module.exports = new PricingService();
