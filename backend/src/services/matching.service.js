/**
 * M1-M3: Servicio de matching mejorado.
 *
 * M1: Ranking de conductores por distancia, rating, aceptación y cancelaciones.
 * M2: Fallback automático — aumenta radio, sube precio sugerido, notifica sin conductores.
 * M3: Cooldown anti-spam de solicitudes.
 */

const User = require('../models/User');

// M3: Cooldown entre solicitudes (por pasajero)
const requestCooldowns = new Map();
const COOLDOWN_MS = 30 * 1000;

class MatchingService {
    constructor() {
        this.activeCampaigns = new Map();
    }

    canRequest(passengerId) {
        const lastRequest = requestCooldowns.get(passengerId.toString());
        if (lastRequest && Date.now() - lastRequest < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
            return { allowed: false, remainingSeconds: remaining };
        }
        return { allowed: true, remainingSeconds: 0 };
    }

    registerRequest(passengerId) {
        requestCooldowns.set(passengerId.toString(), Date.now());
    }

    async findAndRankDrivers(latitude, longitude, radiusKm = 5, maxResults = 10) {
        const radiusMeters = radiusKm * 1000;

        const drivers = await User.find({
            role: 'DRIVER',
            driverStatus: 'AVAILABLE',
            approvalStatus: 'APPROVED',
            isBlocked: { $ne: true },
            lastKnownLocation: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude],
                    },
                    $maxDistance: radiusMeters,
                },
            },
        })
        .select('name avatarUrl avgRating totalRatings acceptanceRate canceledRideCount vehicle lastKnownLocation')
        .limit(maxResults * 2);

        const ranked = drivers.map(driver => {
            const driverCoords = driver.lastKnownLocation?.coordinates || [0, 0];
            const distKm = this._haversine(latitude, longitude, driverCoords[1], driverCoords[0]);

            const distScore = distKm > 0 ? 1 / distKm : 10;
            const ratingScore = (driver.avgRating || 3) / 5;
            const acceptScore = driver.acceptanceRate || 0.5;
            const cancelPenalty = 1 - Math.min((driver.canceledRideCount || 0) / 20, 0.5);

            const score = distScore * ratingScore * acceptScore * cancelPenalty;

            return {
                driver,
                distKm: Number(distKm.toFixed(1)),
                score: Number(score.toFixed(3)),
            };
        });

        ranked.sort((a, b) => b.score - a.score);
        return ranked.slice(0, maxResults);
    }

    async findWithFallback(latitude, longitude) {
        let results = await this.findAndRankDrivers(latitude, longitude, 5);
        if (results.length > 0) return { drivers: results, expandedRadius: false, radius: 5 };

        results = await this.findAndRankDrivers(latitude, longitude, 10);
        if (results.length > 0) return { drivers: results, expandedRadius: true, radius: 10 };

        results = await this.findAndRankDrivers(latitude, longitude, 20);
        return { drivers: results, expandedRadius: true, radius: 20, noDrivers: results.length === 0 };
    }

    _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    abortCampaign(rideId) {
        const rid = rideId.toString();
        if (this.activeCampaigns.has(rid)) {
            clearTimeout(this.activeCampaigns.get(rid));
            this.activeCampaigns.delete(rid);
        }
    }

    async startMatchingCampaign(rideObj, io) {
        try {
            this.abortCampaign(rideObj._id);

            const pickup = rideObj.pickupLocation || {};
            const coords = pickup.coordinates || [];
            if (coords.length < 2) return;
            const lng = coords[0];
            const lat = coords[1];

            const { drivers, noDrivers } = await this.findWithFallback(lat, lng);

            if (noDrivers || !drivers || drivers.length === 0) {
                // CORRECCIÓN 9: Emitir evento si no hay conductores
                io.to(rideObj.passenger.toString()).emit('no_drivers_available', {
                    rideId: rideObj._id,
                    message: "Lo sentimos, no hay conductores disponibles cerca de ti en este momento. Intenta de nuevo más tarde."
                });
                return;
            }

            // Si no está populado, popularlo aquí:
            let rideWithPassenger = rideObj;
            if (typeof rideObj.passenger === 'string' || rideObj.passenger instanceof require('mongoose').Types.ObjectId) {
                const Ride = require('../models/Ride');
                rideWithPassenger = await Ride.findById(rideObj._id)
                    .populate('passenger', 'name avatarUrl profilePhoto avgRating')
                    .lean();
            }

            // Emitir evento a los conductores encontrados
            const { getDriverRoom } = require('../utils/getDriverRoom');
            for (const { driver } of drivers) {
                 io.to(driver._id.toString()).emit('ride:incoming', rideWithPassenger);
                 
                 // Fallback: emitir también por geohash room por si el personal falló
                 if (rideObj.pickupLocation?.latitude && rideObj.pickupLocation?.longitude) {
                   const geoRoom = getDriverRoom(rideObj.pickupLocation.latitude, rideObj.pickupLocation.longitude);
                   io.to(geoRoom).emit('ride:incoming', rideWithPassenger);
                 }
            }
        } catch (error) {
            console.error('[MatchingService] Error en campaign:', error.message);
        }
    }
}

module.exports = new MatchingService();
