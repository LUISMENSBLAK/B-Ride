const User = require('../models/User');
const Ride = require('../models/Ride');

class PricingService {
    constructor() {
        // Configuraciones escalables (fallback de Env)
        this.BASE_FARE_PER_KM = parseFloat(process.env.BASE_FARE_PER_KM) || 0.42;
        this.MIN_FARE         = parseFloat(process.env.MIN_FARE) || 2.00;
        this.BASE_START_FARE  = parseFloat(process.env.BASE_START_FARE) || 1.50;
        this.FARE_PER_MINUTE  = parseFloat(process.env.FARE_PER_MINUTE) || 0.06;
        this.MAX_SURGE = parseFloat(process.env.MAX_SURGE) || 2.5;

        // Tarifas base en MXN (mercado LATAM — Nayarit/Jalisco)
        this.BASE_MXN        = 12;     // cargo de arranque
        this.PER_KM_MXN      = 5.50;   // por kilómetro
        this.PER_MIN_MXN     = 0.80;   // por minuto
        this.MAX_DIST_KM     = 500;    // distancia máxima por viaje

        this.CATEGORY_MULTIPLIERS = {
          ECONOMY: 1.0,
          COMFORT: 1.35,
          PREMIUM: 1.80,
        };
        this.CATEGORY_MIN_MXN = {
          ECONOMY: 45,
          COMFORT: 65,
          PREMIUM: 120,
        };
        this.CATEGORY_LABELS = {
          ECONOMY: { label: 'Viaje',   description: 'Económico · hasta 4 personas' },
          COMFORT: { label: 'Confort', description: 'Autos más nuevos · comodidad extra' },
          PREMIUM: { label: 'Premium', description: 'Vehículo de lujo · servicio VIP' },
        };

        // Geopartitioning Truncation factor: `Math.floor(x * 50) / 50` ~= Grid de 2.22 km
        this.GRID_FACTOR = 50; 

        // Currency rates — override via env or use conservative defaults.
        // TODO: Replace with an ExchangeRate-API / Fixer.io call cached 1h for production.
        this.CURRENCY_RATES = {
            USD: 1.0,
            MXN: parseFloat(process.env.RATE_MXN) || 17.5,
            EUR: parseFloat(process.env.RATE_EUR) || 0.92,
        };

        // Cache in-memory temporal: { "zoneId": multiplier }
        this.surgeCache = new Map();
        
        // Cache Crudo de Inteligencia para modulo Heat Zones
        this.rawDemandMap = new Map();
        this.rawSupplyMap = new Map();

        // Cron: recalculate market state every 5 minutes (was 15s — too aggressive).
        // Only runs while the server is alive; no cleanup needed beyond process exit.
        setInterval(() => {
            this.calculateMarketState().catch(e => console.error('[Pricing] Crash cron:', e.message));
        }, 5 * 60 * 1000);
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

        const basePrice = Math.max(
            this.MIN_FARE,
            this.BASE_START_FARE + (distanceKm * this.BASE_FARE_PER_KM)
        );
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

    /**
     * @desc Convierte un monto base en USD a otra moneda utilizando CURRENCY_RATES
     */
    convertAmount(amountInUsd, targetCurrency = 'USD') {
        const rate = this.CURRENCY_RATES[targetCurrency.toUpperCase()] || 1.0;
        return amountInUsd * rate;
    }

    /**
     * Estima precios para todas las categorías en una sola llamada
     */
    estimateAllCategories(pickupLat, pickupLng, dropoffLat, dropoffLng) {
      const base = this.estimateRide(pickupLat, pickupLng, dropoffLat, dropoffLng);
      const categories = {};
      for (const [cat, mult] of Object.entries(this.CATEGORY_MULTIPLIERS)) {
        const price = Math.round(base.recommendedPrice * mult * 10) / 10;
        categories[cat] = {
          ...this.CATEGORY_LABELS[cat],
          recommendedPrice: price,
          surgeMultiplier: base.surgeMultiplier,
          highDemand: base.highDemand,
          distanceEstimatedKm: base.distanceEstimatedKm,
        };
      }
      return { base, categories };
    }

    async getPricesByCategory(originLat, originLng, destLat, destLng) {
      // Haversine
      const R = 6371;
      const dLat = (destLat - originLat) * Math.PI / 180;
      const dLng = (destLng - originLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2
        + Math.cos(originLat * Math.PI/180) * Math.cos(destLat * Math.PI/180) * Math.sin(dLng/2)**2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distKm > this.MAX_DIST_KM) {
        const err = new Error(`La distancia máxima es ${this.MAX_DIST_KM} km.`);
        err.code = 'DISTANCE_EXCEEDED';
        throw err;
      }

      const hour = new Date().getHours();
      const trafficMult = ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) ? 1.3 : 1.0;
      const etaMin = Math.max(1, Math.round((distKm / 40) * 60 * trafficMult));

      // Surge del cache
      const zoneId = this.getZoneId(originLat, originLng);
      const surge = this.surgeCache.get(zoneId) || 1.0;

      const baseMXN = this.BASE_MXN + (this.PER_KM_MXN * distKm) + (this.PER_MIN_MXN * etaMin);

      const result = {};
      for (const [cat, mult] of Object.entries(this.CATEGORY_MULTIPLIERS)) {
        const raw = baseMXN * mult * surge;
        const minMXN = this.CATEGORY_MIN_MXN[cat];
        result[cat] = {
          category:   cat,
          ...this.CATEGORY_LABELS[cat],
          priceMXN:   Math.max(minMXN, Math.round(raw)),
          minFareMXN: minMXN,
          distKm:     Number(distKm.toFixed(1)),
          etaMin,
          surgeMultiplier: Number(surge.toFixed(2)),
        };
      }
      return result;
    }
}

module.exports = new PricingService();
