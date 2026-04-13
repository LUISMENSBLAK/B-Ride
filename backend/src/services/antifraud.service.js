/**
 * F1-F4: Servicio de antifraude.
 *
 * F1: Detección de multi-cuenta por dispositivo.
 * F3: Detección de GPS spoofing (velocidad imposible).
 * F4: Validación server-side de precios.
 */

const User = require('../models/User');
const { haversineKm } = require('../utils/geo'); // DRY: single haversine source

// F3: Historial de ubicaciones por driver (en memoria)
const locationHistory = new Map(); // driverId → [{ lat, lng, timestamp }]
const LOCATION_HISTORY_TTL_MS = 30 * 60 * 1000; // 30 min

// Memory leak fix: purge inactive drivers every 10 minutes
setInterval(() => {
    const cutoff = Date.now() - LOCATION_HISTORY_TTL_MS;
    for (const [id, history] of locationHistory) {
        const last = history[history.length - 1];
        if (!last || last.timestamp < cutoff) locationHistory.delete(id);
    }
}, 10 * 60 * 1000);

class AntiFraudService {

    /**
     * F1: Registrar deviceId y detectar cuentas duplicadas por dispositivo.
     * Returns { flagged: boolean, reason?: string }
     */
    async checkDeviceId(userId, deviceId) {
        if (!deviceId) return { flagged: false };

        // Buscar si otro usuario ya usa este dispositivo
        const existingUser = await User.findOne({
            _id: { $ne: userId },
            deviceIds: deviceId,
            isBlocked: { $ne: true },
        }).select('_id email');

        if (existingUser) {
            console.warn(`[AntiFraud] ⚠️ Multi-cuenta detectada: deviceId ${deviceId} usado por ${userId} y ${existingUser._id}`);
            return {
                flagged: true,
                reason: `Dispositivo compartido con cuenta ${existingUser.email}`,
            };
        }

        // Registrar dispositivo
        await User.findByIdAndUpdate(userId, {
            $addToSet: { deviceIds: deviceId },
            lastDeviceId: deviceId,
        });

        return { flagged: false };
    }

    /**
     * F3: Detectar velocidad imposible (GPS spoofing).
     * Si un conductor se mueve a >200 km/h, es sospechoso.
     */
    detectGPSSpoofing(driverId, latitude, longitude) {
        const MAX_SPEED_KMH = 200;
        const history = locationHistory.get(driverId.toString()) || [];

        if (history.length > 0) {
            const last = history[history.length - 1];
            const timeDiffHours = (Date.now() - last.timestamp) / (1000 * 60 * 60);

            if (timeDiffHours > 0) {
                const distKm = this._haversine(last.lat, last.lng, latitude, longitude);
                const speedKmh = distKm / timeDiffHours;

                if (speedKmh > MAX_SPEED_KMH) {
                    console.warn(`[AntiFraud] ⚠️ GPS Spoofing sospechoso: driver ${driverId} a ${speedKmh.toFixed(0)} km/h`);
                    return {
                        spoofing: true,
                        speed: Math.round(speedKmh),
                        maxSpeed: MAX_SPEED_KMH,
                    };
                }
            }
        }

        // Registrar punto
        history.push({ lat: latitude, lng: longitude, timestamp: Date.now() });
        if (history.length > 20) history.shift(); // Solo guardar últimos 20 puntos
        locationHistory.set(driverId.toString(), history);

        return { spoofing: false };
    }

    /**
     * F4: Validación de precios server-side.
     * El precio propuesto no puede ser absurdamente bajo ni alto.
     */
    validatePrice(proposedPrice, distanceKm) {
        const MIN_PRICE_PER_KM = 0.50;  // $0.50/km mínimo
        const MAX_PRICE_PER_KM = 10.00; // $10/km máximo
        const MIN_BASE_PRICE = 2.00;     // $2 mínimo absoluto
        const MAX_ABSOLUTE_PRICE = 500;  // $500 máximo absoluto

        if (proposedPrice < MIN_BASE_PRICE) {
            return { valid: false, reason: `Precio mínimo es $${MIN_BASE_PRICE}` };
        }
        if (proposedPrice > MAX_ABSOLUTE_PRICE) {
            return { valid: false, reason: `Precio máximo es $${MAX_ABSOLUTE_PRICE}` };
        }

        if (distanceKm > 0) {
            const pricePerKm = proposedPrice / distanceKm;
            if (pricePerKm < MIN_PRICE_PER_KM) {
                return { valid: false, reason: `Precio demasiado bajo para la distancia (${pricePerKm.toFixed(2)}/km)` };
            }
            if (pricePerKm > MAX_PRICE_PER_KM) {
                return { valid: false, reason: `Precio demasiado alto para la distancia (${pricePerKm.toFixed(2)}/km)` };
            }
        }

        return { valid: true };
    }

    _haversine(lat1, lon1, lat2, lon2) {
        return haversineKm(lat1, lon1, lat2, lon2);
    }
}

module.exports = new AntiFraudService();
