const Ride = require('../models/Ride');
const StateMachine = require('../utils/stateMachine');
const paymentService = require('./payment.service');

class RideService {
    async createRideRequest(passengerId, pickupLocation, dropoffLocation, proposedPrice, options = {}) {
        const { isScheduled = false, scheduledAt = null, promoCode = null, vehicleCategory = 'ECONOMY' } = options;
        
        const pricingService = require('./pricing.service');
        const minFare = pricingService.CATEGORY_MIN_MXN?.[vehicleCategory] ?? 45;
        
        if (proposedPrice < minFare) {
            throw new Error(
                `El precio mínimo para categoría ${vehicleCategory} es $${minFare} MXN. ` +
                `Tu oferta de $${proposedPrice} es demasiado baja para que algún conductor la acepte.`
            );
        }

        // Wrapper de compatibilidad hacia GeoJSON
        const geoPickup = {
             latitude: pickupLocation.latitude,
             longitude: pickupLocation.longitude,
             address: pickupLocation.address,
             location: { type: 'Point', coordinates: [pickupLocation.longitude, pickupLocation.latitude] }
        };
        const geoDropoff = {
             latitude: dropoffLocation.latitude,
             longitude: dropoffLocation.longitude,
             address: dropoffLocation.address,
             location: { type: 'Point', coordinates: [dropoffLocation.longitude, dropoffLocation.latitude] }
        };

        // Integración con Pricing Machine
        const { surgeMultiplier, zoneId } = pricingService.getSurgeForLocation(pickupLocation.latitude, pickupLocation.longitude);

        // Evaluar promo
        let finalDiscount = 0;
        let appliedPromoCode = null;
        if (promoCode) {
            const Promo = require('../models/Promo');
            const promo = await Promo.findOne({ code: promoCode.toUpperCase(), isActive: true });
            if (promo) {
                // Validación de fecha no necesaria aquí si ya se validó en check/validate pero la haremos segura
                if (promo.type === 'FIXED_AMOUNT') {
                    finalDiscount = promo.value;
                } else if (promo.type === 'PERCENTAGE') {
                    finalDiscount = (proposedPrice * promo.value) / 100;
                    if (promo.maxDiscount && finalDiscount > promo.maxDiscount) finalDiscount = promo.maxDiscount;
                }
                appliedPromoCode = promo.code;
                promo.usedCount += 1;
                await promo.save();
            }
        }

        const ride = await Ride.create({
            passenger: passengerId,
            pickupLocation: geoPickup,
            dropoffLocation: geoDropoff,
            proposedPrice,
            isScheduled,
            scheduledAt,
            promoCode: appliedPromoCode,
            discountApplied: finalDiscount,
            status: isScheduled ? 'SCHEDULED' : 'REQUESTED',
            version: 1,
            vehicleCategory,
            pricingMeta: {
                surgeMultiplier,
                zoneId,
                timestamp: new Date()
            }
        });

        return await Ride.findById(ride._id).populate('passenger', 'name email phoneNumber');
    }

    // Nuevo Motor: Subasta InDrive (Conductor propone)
    async submitBid(rideId, driverId, price) {
        const ride = await Ride.findOneAndUpdate(
            { _id: rideId, status: { $in: ['REQUESTED', 'NEGOTIATING'] } },
            { 
               $push: { bids: { driver: driverId, price, status: 'PENDING' } },
               $set: { status: 'NEGOTIATING' },
               $inc: { version: 1 }
            },
            { new: true }
        ).populate('passenger', 'name email phoneNumber')
         .populate('bids.driver', 'name email phoneNumber avgRating totalRatings');


        if (!ride) throw new Error('Viaje no disponible o expirado');
        return ride;
    }

    // Nuevo Motor: Resolución Atómica Transaccional con Lock Estricto (Pasajero Elige)
    async confirmBid(rideId, passengerId, bidId, driverId) {
        // Validador Anti-Latencia: Revisa que la oferta no lleve colgada más de 25s
        const preCheck = await Ride.findOne({ _id: rideId, 'bids._id': bidId }, { 'bids.$': 1 });
        if (!preCheck || !preCheck.bids[0]) throw new Error('Viaje o Bid no encontrado');
        
        const bidTime = preCheck.bids[0].createdAt.getTime();
        if (Date.now() - bidTime > 25000) {
             throw new Error('Esta oferta ha expirado (max 25s). Por favor selecciona una oferta más reciente.');
        }

        // Condición estricta de carrera: status DEBE ser NEGOTIATING y driver nulo. No confiamos.
        const ride = await Ride.findOneAndUpdate(
            { 
                _id: rideId, 
                passenger: passengerId, 
                status: 'NEGOTIATING',
                driver: null
            },
            {
               $set: { 
                   status: 'ACCEPTED', 
                   driver: driverId,
               },
               $inc: { version: 1 }
            },
            { new: true }
        );

        if (!ride) throw new Error('Viaje ya fue asignado o ya no está en negociación (Race Condition prevenida)');

        // Rechaza recursivamente a los demás bids de manera transaccional
        await Ride.updateOne(
            { _id: rideId },
            { $set: { 'bids.$[win].status': 'ACCEPTED', 'bids.$[lose].status': 'REJECTED' } },
            { arrayFilters: [{ 'win._id': bidId }, { 'lose._id': { $ne: bidId } }] }
        );

        // Retornamos el viaje pulido, junto a un array de drivers que perdieron para notificar trip_rejected en socket events
        const finalRide = await Ride.findById(ride._id)
            .populate('passenger', 'name email phoneNumber')
            .populate('driver', 'name email phoneNumber');
            
        // Extraemos IDs perdedores
        const rejectedDriverIds = ride.bids
            .filter(b => b.driver.toString() !== driverId.toString())
            .map(b => b.driver.toString());

        return { acceptedRide: finalRide, rejectedDriverIds };
    }


    // advanceRideStatus requiere driverId (solo conductores), por eso existe este método separado.
    async cancelRide(rideId, passengerId) {
        const ride = await Ride.findOneAndUpdate(
            {
                _id: rideId,
                passenger: passengerId,
                status: { $in: ['REQUESTED', 'NEGOTIATING', 'ACCEPTED'] }
            },
            {
                $set: {
                    status: 'CANCELLED',
                    'bids.$[pending].status': 'REJECTED'
                },
                $inc: { version: 1 }
            },
            {
                new: true,
                arrayFilters: [{ 'pending.status': 'PENDING' }]
            }
        ).populate('passenger driver', 'name email phoneNumber');

        if (!ride) throw new Error('Viaje no encontrado o ya fue completado/cancelado');

        // Disparo asíncrono robusto (Idempotente)
        paymentService.executeCancellation(rideId).catch(console.error);
        require('./chat.service').cleanupChat(rideId);

        return ride;
    }

    async advanceRideStatus(rideId, driverId, nextStatus) {
        // Buscar el viaje actual primero para validar Graph de Transitions
        const rideQuery = await Ride.findOne({ _id: rideId, driver: driverId });
        if (!rideQuery) throw new Error('Viaje no encontrado o no autorizado para avanzar');

        // Validar transición StateMachine
        StateMachine.validate(rideQuery.status, nextStatus);

        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { 
               $set: { status: nextStatus },
               $inc: { version: 1 }
            },
            { new: true }
        )
        .populate('passenger', 'name email phoneNumber')
        .populate('driver', 'name email phoneNumber');

        // Intercepción Financiera (NO bloquea el Thread actual)
        if (nextStatus === 'COMPLETED') {
            const User = require('../models/User');

            try {
                if (rideQuery.dropoffLocation) {
                    await User.findByIdAndUpdate(rideQuery.passenger, {
                        $push: {
                            recentDestinations: {
                                $each: [{
                                    address: rideQuery.dropoffLocation.address,
                                    latitude: rideQuery.dropoffLocation.latitude || rideQuery.dropoffLocation.location?.coordinates[1] || 0,
                                    longitude: rideQuery.dropoffLocation.longitude || rideQuery.dropoffLocation.location?.coordinates[0] || 0,
                                    usedAt: Date.now()
                                }],
                                $slice: -5
                            }
                        }
                    });
                }
            } catch (err) {
                console.error('[RecentDestinations] Error saving:', err.message);
            }
            

            try {
                const p = await User.findById(rideQuery.passenger);
                if (p && p.referredBy && !p.referralRewardClaimed) {
                    p.referralRewardClaimed = true;
                    // Pasajero gana $20 MXN
                    p.walletBalance += 20;
                    await p.save();
                    
                    // Referidor gana $20 MXN
                    await User.findByIdAndUpdate(p.referredBy, {
                         $inc: { referralCount: 1, referralBonusEarned: 20, walletBalance: 20 }
                    });
                    

                }
            } catch (rErr) {
                 console.error('[Referral Reward Error]', rErr.message);
            }

            paymentService.executeCapture(rideId).catch(console.error);
            require('./chat.service').cleanupChat(rideId);
        } else if (nextStatus === 'CANCELLED') {
            paymentService.executeCancellation(rideId).catch(console.error);
            require('./chat.service').cleanupChat(rideId);
        }

        return ride;
    }

    // Mantenemos por propósitos de auditoria de admins
    async updateRideStatus(rideId, status) {
        const validStatuses = ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status');
        }

        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { status, $inc: { version: 1 } },
            { new: true }
        ).populate('passenger driver', 'name email phoneNumber');

        if (!ride) {
            throw new Error('Ride not found');
        }

        return ride;
    }

    async getRideHistory(userId, role, page = 1, limit = 50) {
        const query = role === 'DRIVER' ? { driver: userId } : { passenger: userId };
        const skip = (page - 1) * limit;
        const rides = await Ride.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('passenger driver', 'name email avatarUrl');
        return rides;
    }
}

module.exports = new RideService();
