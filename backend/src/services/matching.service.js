const User = require('../models/User');
const Ride = require('../models/Ride');

// Memoria Temporal de Timeouts para poder cancelarlos
const activeMatchings = new Map();

class MatchingService {
    /**
     * @desc Formula de Scoring algorítmica.
     * Combina Distancia, Rating, Cancelaciones y Performance Histórico.
     */
    calculateDriverScore(driver, tripCoordinates) {
        // Distancia Haversine Básica (Mongo $nearSphere nos ahorra esto usualmente, pero podemos refinar)
        const dLat = driver.lastKnownLocation.coordinates[1];
        const dLng = driver.lastKnownLocation.coordinates[0];
        const pLat = tripCoordinates[1];
        const pLng = tripCoordinates[0];

        const R = 6371; // km
        const radLat1 = pLat * Math.PI / 180;
        const radLat2 = dLat * Math.PI / 180;
        const deltaLat = (dLat - pLat) * Math.PI / 180;
        const deltaLng = (dLng - pLng) * Math.PI / 180;

        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(radLat1) * Math.cos(radLat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        // Ponderaciones (Factores Tuning)
        const ratingScore = (driver.avgRating || 4.0) * 20; // Hasta 100 ptos
        const distancePenalty = distanceKm * 15; // -15 ptos por cada km lejano
        const cancelPenalty = (driver.canceledRideCount || 0) * 10; // Cuidado con abusers
        const acceptanceBonus = (driver.acceptanceRate || 1.0) * 20; // 0 a 20 ptos
        const timePenalty = ((driver.avgResponseTimeMs || 5000) / 1000) * 1.5; // -1.5 ptos por cada segundo de lentitud promedio

        // Base 50 para evitar scores ultra negativos en normales
        const finalScore = 50 + ratingScore + acceptanceBonus - distancePenalty - cancelPenalty - timePenalty;

        return {
             driver,
             distanceKm,
             score: finalScore
        };
    }

    /**
     * @desc Inicia la campaña asíncrona de Broadcasting
     */
    async startMatchingCampaign(ride, io) {
        // En lugar de guardar el payload completo, trackeamos qué Timeout existe
        activeMatchings.set(ride._id.toString(), { active: true, timers: [] });

        const pickupLng = ride.pickupLocation.longitude;
        const pickupLat = ride.pickupLocation.latitude;

        try {
            // Extraer TODOS los candiadatos disponibles en un solo hit (<10km) para evitar spammeo a Base de Datos
            const candidates = await User.find({
                role: 'DRIVER',
                driverStatus: 'AVAILABLE',
                lastKnownLocation: {
                    $nearSphere: {
                        $geometry: { type: 'Point', coordinates: [pickupLng, pickupLat] },
                        $maxDistance: 10000 // 10 km (Fallback máximo real)
                    }
                }
            }).select('_id expoPushTokens driverStatus lastKnownLocation avgRating canceledRideCount acceptanceRate avgResponseTimeMs');

            console.log(`[Matching] Generando campaña para Ride ${ride._id}. ${candidates.length} online candidatos extraídos.`);

            if (candidates.length === 0) {
                 this.scheduleTimeout(ride._id.toString(), 2000, () => {
                      this.sendSoftExpire(ride._id, io);
                 });
                 return;
            }

            // Scoring & Sorting O(N) log N
            const scoredRings = candidates
                .map(d => this.calculateDriverScore(d, [pickupLng, pickupLat]))
                .sort((a, b) => b.score - a.score);

            // Anillos
            const core5km = scoredRings.filter(s => s.distanceKm <= 5.0);
            const fallback10km = scoredRings.filter(s => s.distanceKm > 5.0);

            const ring0 = core5km.slice(0, 5);
            const ring5s = core5km.slice(5, 15);
            const ring12s = core5km.slice(15);
            
            // EXECUTE RINGS
            // T=0s
            this.dispatchRing(ring0, ride, io);

            // T=5s
            this.scheduleTimeout(ride._id.toString(), 5000, () => {
                 this.dispatchRing(ring5s, ride, io);
            });

            // T=12s
            this.scheduleTimeout(ride._id.toString(), 12000, () => {
                 this.dispatchRing(ring12s, ride, io);
            });

            // T=25s (Fallback a >=5km)
            this.scheduleTimeout(ride._id.toString(), 25000, () => {
                 this.dispatchRing(fallback10km, ride, io, true);
            });

            // LifeCycle Timers
            this.scheduleTimeout(ride._id.toString(), 45000, () => {
                 this.sendSoftExpire(ride._id, io);
            });

            this.scheduleTimeout(ride._id.toString(), 90000, async () => {
                 await this.sendHardExpire(ride._id, ride.passenger, io);
            });

        } catch (e) {
             console.error(`[Matching] Falla en motor de inteligencia: ${e.message}`);
        }
    }

    /**
     * Helper paramétrico para disparar el socket a clusters específicos
     */
    dispatchRing(scoredCluster, ride, io, isFallback = false) {
        if (!scoredCluster || scoredCluster.length === 0) return;
        // Verify still valid
        const track = activeMatchings.get(ride._id.toString());
        if (!track || !track.active) return; // Si ya alguien aceptó el viaje o el pasajero canceló

        console.log(`[Matching] Lanzando Anillo (${isFallback?'Fallback':'Regular'}) a ${scoredCluster.length} choferes. Ride: ${ride._id}`);
        // Notificaciones Push Integradas
        const pushNotifications = []; 
        scoredCluster.forEach(item => {
            const driverIdStr = item.driver._id.toString();
            // Emit Socket RealTime
            io.to(driverIdStr).emit('ride:incoming', ride);
            // Push Queue Builder
            pushNotifications.push({
                userId: driverIdStr,
                title: isFallback ? 'Viaje Urgente a Media Distancia' : '¡Nuevo viaje cerca!',
                body: `Un pasajero solicita viaje de $${ride.proposedPrice}`,
                data: { type: 'ride:incoming', rideId: ride._id.toString(), screen: 'DriverHome' }
            });
        });
        
        require('./notification.service').sendSmartPushNotifications(pushNotifications);
    }

    /**
     * @desc Cancela proactivamente todos los timeouts de anillos si el viaje muta.
     */
    abortCampaign(rideId) {
        const track = activeMatchings.get(rideId.toString());
        if (track) {
            track.active = false;
            track.timers.forEach(t => clearTimeout(t));
            activeMatchings.delete(rideId.toString());
            console.log(`[Matching] Campaña anulada para Ride ${rideId}`);
        }
    }

    // INTERNAL SCHEDULER
    scheduleTimeout(rideIdStr, delayMs, action) {
        const track = activeMatchings.get(rideIdStr);
        if (!track || !track.active) return;

        const timer = setTimeout(() => {
             // Re-validator por seguridad de heap
             const currentTrack = activeMatchings.get(rideIdStr);
             if (currentTrack && currentTrack.active) {
                 action();
             }
        }, delayMs);
        track.timers.push(timer);
    }

    // SOFT EXPIRY (45s) -> Permite que lleguen bids aún pero avisa a UI que mejore precio
    sendSoftExpire(rideId, io) {
        const track = activeMatchings.get(rideId.toString());
        if (!track || !track.active) return;
        io.to(`ride_${rideId}`).emit('trip_soft_expire', { rideId });
        console.log(`[Matching] SOFT Expiry disparado en Ride ${rideId}`);
    }

    // HARD EXPIRY (90s) -> Destruye el Trip en Base de datos Autonomamente
    async sendHardExpire(rideId, passengerId, io) {
        const track = activeMatchings.get(rideId.toString());
        if (!track || !track.active) return;
        this.abortCampaign(rideId.toString()); // Cleanup
        
        try {
            // El RideService cancelará o marcará fallido
            const rideSvc = require('./ride.service');
            const ride = await rideSvc.cancelRide(rideId, passengerId, true); // `true` for system auto-cancel flag if supported
            
            io.to(`ride_${rideId}`).emit('trip_state_changed', ride);
            // Avisar también fallback del creador
            io.to(passengerId.toString()).emit('trip_state_changed', ride);
            console.log(`[Matching] HARD Expiry ejecutado. Ride abolido ${rideId}`);
        } catch (e) {
            console.error(`[Matching] Fallo cerrando auto-destrucción Ride ${rideId}:`, e.message);
        }
    }
}

module.exports = new MatchingService();
