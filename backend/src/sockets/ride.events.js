const { getIO } = require('./index');
const rideService = require('../services/ride.service');
const User = require('../models/User');
const Ride = require('../models/Ride');
const idempotency = require('../services/idempotency.service');
const watchdog = require('../services/watchdog.service');
const matchingService = require('../services/matching.service');
const locationCache = require('../services/locationCache.service');

// Memoria para Rate Limiting de Ofertas Cíclicas
const bidRateLimits = new Map();

const rideEvents = (socket) => {
    console.log(`[Sockets] Usuario Conectado: ${socket.id}`);

    // Driver/Passenger joins their own private room using their User ID
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`[Sockets] Usuario ${userId} se unió a su room privado.`);
    });

    socket.on('join_ride_room', (rideId) => {
        if (!rideId) return;
        socket.join(`ride_${rideId}`);
        console.log(`[Sockets] Usuario ${socket.id} se unió a la room dinámica ride_${rideId}`);
    });

    // UNIRSE A ROOM DE DRIVERS POR GEOHASH
    socket.on('driver:join', ({ lat, lng }) => {
        const getDriverRoom = require('../utils/getDriverRoom').getDriverRoom;
        const room = getDriverRoom(lat, lng);
        if(!room) return;
        
        // Abandonar rooms anteriores de geohash si existe
        if (socket.currentGeoRoom && socket.currentGeoRoom !== room) {
             socket.leave(socket.currentGeoRoom);
        }
        
        socket.join(room);
        socket.currentGeoRoom = room;
        console.log(`[SOCKET] Driver Reconectado/Unido Socket: ${socket.id}`);
        console.log(`[ROOM] Driver se unió a room: ${room}`);
    });

    // Cambiar estado a AVAILABLE o OFFLINE
    socket.on('setDriverStatus', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { userId, status, eventId } = payload;
            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            if (userId) {
                await User.findByIdAndUpdate(userId, { driverStatus: status });
            }

            // BUG 2 FIX: Notificar a pasajeros cercanos cuando un conductor se pone online
            if (status === 'AVAILABLE' && userId) {
                // Obtener ubicación del conductor desde la caché en RAM o desde la room geohash actual
                const cachedLoc = locationCache.cache.get(userId.toString());
                if (cachedLoc) {
                    // Emitir a la room geohash actual del driver para que pasajeros en la misma celda lo reciban
                    const { getDriverRoom } = require('../utils/getDriverRoom');
                    const geoRoom = getDriverRoom(cachedLoc.lat, cachedLoc.lng);
                    if (geoRoom) {
                        getIO().to(geoRoom).emit('driver_available_nearby', { count: 1, driverId: userId });
                        console.log(`[Sockets] Driver ${userId} online -> notificado a room ${geoRoom}`);
                    }
                } else if (socket.currentGeoRoom) {
                    // Fallback: usar la room geohash actual del socket
                    getIO().to(socket.currentGeoRoom).emit('driver_available_nearby', { count: 1, driverId: userId });
                    console.log(`[Sockets] Driver ${userId} online -> notificado a room ${socket.currentGeoRoom} (fallback)`);
                }
            }

            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch(e) {
            if (isAckRequired) ack({ success: false, error: e.message });
        }
    });

    // 2. WEBSOCKETS RECOVERY: Recuperación inicial y de subastas
    socket.on('sync_state', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { userId, role } = payload;
            if (!userId) throw new Error('userId required');

            // Find an active ride for this user
            const activeRideQuery = role === 'DRIVER' ? { driver: userId } : { passenger: userId };
            const activeStatus = ['REQUESTED', 'NEGOTIATING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
            
            const activeRide = await Ride.findOne({ ...activeRideQuery, status: { $in: activeStatus } })
                .populate('passenger', 'name email phoneNumber')
                .populate('driver', 'name email phoneNumber')
                .populate('bids.driver', 'name email avgRating totalRatings');

            if (activeRide) {
                // Ensure room rejoin
                socket.join(`ride_${activeRide._id.toString()}`);
                if (isAckRequired) ack({ success: true, activeRide });
            } else {
                if (isAckRequired) ack({ success: true, activeRide: null });
            }
        } catch (error) {
            console.error('[Socket Sync] Error:', error.message);
            if (isAckRequired) ack({ success: false, error: error.message });
        }
    });

    // Watchdog ping from driver
    socket.on('driver_heartbeat', (payload) => {
        const { driverId, rideId } = payload;
        watchdog.ping(driverId, rideId);
    });

    // Update driver location in real-time
    socket.on('updateLocation', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { driverId, longitude, latitude, passengerId, rideId } = payload;
            // No requerimos idempotency check muy estricto aquí por volumen de datos
            
            if (driverId) {
                // Delegamos persistencia a la Caché C++ en RAM evadiendo Mongoose
                locationCache.updateLocation(driverId, longitude, latitude);

                // GEO-SHARDING SOCKETS: Suscribir a la celda (~2km) O(1)
                const getDriverRoom = require('../utils/getDriverRoom').getDriverRoom;
                const newGeoRoom = getDriverRoom(latitude, longitude);

                if (socket.currentGeoRoom !== newGeoRoom) {
                     if (socket.currentGeoRoom) socket.leave(socket.currentGeoRoom);
                     socket.join(newGeoRoom);
                     socket.currentGeoRoom = newGeoRoom;
                }
            }
            
            // Emit to ride room instead of raw passenger ID if possible
            if (rideId) {
                 getIO().to(`ride_${rideId}`).emit('driverLocationUpdate', payload);
            } else if (passengerId) {
                 getIO().to(passengerId).emit('driverLocationUpdate', payload);
            }

            if (isAckRequired) ack({ success: true });
        } catch(e) {
            if (isAckRequired) ack({ success: false, error: e.message });
        }
    });

    // 1. Pasajero pide viaje
    socket.on('requestRide', async (rideData, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            if (socket.userRole !== 'PASSENGER' && socket.userRole !== 'USER') {
                socket.emit('rideError', { message: 'Acceso denegado. Solo pasajeros pueden pedir viajes.' });
                return;
            }
            
            const { pickupLocation, dropoffLocation, proposedPrice, eventId, isScheduled, scheduledAt, promoCode } = rideData;
            const passengerId = socket.userId;
            if (!passengerId) throw new Error('No autorizado');

            if (eventId && await idempotency.isDuplicate(eventId)) {
                if(isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            const newRide = await rideService.createRideRequest(
                 passengerId, pickupLocation, dropoffLocation, proposedPrice, 
                 { isScheduled, scheduledAt, promoCode }
            );

            // Phase 9 rule: si es Scheduled, no se propaga todavía. Se guardará y el cron hará la propagación.
            if (!isScheduled) {
                 matchingService.startMatchingCampaign(newRide, getIO());
            }

            // Rebotar al pasajero para avisarle que se creó con éxito
            getIO().to(passengerId).emit('rideRequestCreated', newRide);
            if (isAckRequired) ack({ success: true, status: 'processed', newRide });

        } catch (error) {
            console.error('[Rides] Error creating ride:', error);
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 1b. Pasajero sube el precio de su solicitud activa
    socket.on('update_ride_price', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            if (socket.userRole !== 'PASSENGER' && socket.userRole !== 'USER') {
                socket.emit('rideError', { message: 'Acceso denegado. Solo pasajeros pueden actualizar el precio.' });
                return;
            }
            
            const { rideId, newPrice } = payload;
            const passengerId = socket.userId;
            
            if (!rideId || !newPrice) throw new Error('rideId y newPrice requeridos');

            const Ride = require('../models/Ride');
            const ride = await Ride.findById(rideId);
            if (!ride) throw new Error('Viaje no encontrado');
            if (ride.passenger.toString() !== passengerId) throw new Error('No autorizado');

            ride.proposedPrice = newPrice;
            ride.version = (ride.version || 1) + 1;
            await ride.save();

            console.log(`[Bidding] Pasajero ${passengerId} subió precio a $${newPrice}`);

            // Notificar a conductores en la room del viaje y al pasajero
            getIO().to(`ride_${rideId}`).emit('ride_price_updated', {
                rideId,
                newPrice,
                version: ride.version,
            });

            // Relanzar matching con nuevo precio
            matchingService.startMatchingCampaign(ride.toObject(), getIO());

            if (isAckRequired) ack({ success: true, newPrice });
        } catch (error) {
            console.error('[Rides] Error updating price:', error.message);
            if (isAckRequired) ack({ success: false, error: error.message });
        }
    });

    // 2. Conductor Envía Puja (Bid)
    socket.on('trip_bid', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            if (socket.userRole !== 'DRIVER') {
                socket.emit('rideError', { message: 'Acceso denegado. Solo conductores pueden pujar.' });
                return;
            }
        
            const { rideId, price, passengerId, eventId } = payload;
            const driverId = socket.userId;

            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            
            // ANTI-SPAM Rate Limiting
            const rateKey = `${driverId}_${rideId}`;
            const limit = bidRateLimits.get(rateKey) || { count: 0, lastBidAt: 0 };
            const now = Date.now();

            if (now - limit.lastBidAt < 3000) {
                 throw new Error('Rate limit: Debes esperar 3 segundos entre ofertas.');
            }
            if (limit.count >= 3) {
                 throw new Error('Máximo de ofertas alcanzado para este viaje (Max 3).');
            }

            limit.lastBidAt = now;
            limit.count += 1;
            bidRateLimits.set(rateKey, limit);
            
            const updatedRide = await rideService.submitBid(rideId, driverId, price);
            console.log(`[Bidding] Chofer ${driverId} propone $${price}`);
            
            getIO().to(passengerId).emit('trip_bid_received', updatedRide);
            
            require('../services/notification.service').sendSmartPushNotifications([{
                userId: passengerId,
                title: 'Nueva Oferta',
                body: 'Un conductor ha hecho una oferta para tu viaje',
                data: { type: 'trip_bid', rideId: rideId }
            }]);

            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch (error) {
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 3. Pasajero Acepta un Bid
    socket.on('trip_accept_bid', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            if (socket.userRole !== 'PASSENGER' && socket.userRole !== 'USER') {
                socket.emit('rideError', { message: 'Acceso denegado. Solo pasajeros pueden aceptar pujas.' });
                return;
            }
        
            const { rideId, bidId, driverId, eventId } = payload;
            const passengerId = socket.userId;

            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            const { acceptedRide, rejectedDriverIds } = await rideService.confirmBid(rideId, passengerId, bidId, driverId);
            
            // Cerrar campañas abiertas de propagación
            matchingService.abortCampaign(rideId);

            // Marcar al conductor seleccionado como ocupado
            await User.findByIdAndUpdate(driverId, { driverStatus: 'ON_TRIP' });

            // Avisar al ganador (Driver - Room explícita)
            getIO().to(driverId).emit('trip_accepted', acceptedRide);
            
            // Rejection Cascade
            if (rejectedDriverIds && rejectedDriverIds.length > 0) {
                rejectedDriverIds.forEach(loserId => {
                    getIO().to(loserId.toString()).emit('trip_rejected', { rideId });
                });
            }
            
            // Broadcast a la room de este viaje
            getIO().to(`ride_${rideId}`).emit('trip_state_changed', acceptedRide);
            // Fallback al pasajero directamente por si aún no unió al room
            getIO().to(passengerId).emit('trip_state_changed', acceptedRide);

            require('../services/notification.service').sendSmartPushNotifications([{
                userId: driverId,
                title: '¡Subasta Ganada!',
                body: 'Un pasajero ha aceptado tu oferta. Dirígete al origen.',
                data: { type: 'trip_accepted', rideId: acceptedRide._id.toString(), screen: 'DriverHome' }
            }]);
            
            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch (error) {
            console.error('[Bidding] Error confirmando Bid:', error.message);
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 3b. Pasajero cancela el viaje — PRODUCTION FIX
    socket.on('cancel_ride', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId, eventId } = payload;
            
            // CORRECCIÓN 10: Validar
            const passengerId = socket.user?.id;
            if (!passengerId) throw new Error('No autorizado');

            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            const cancelledRide = await rideService.cancelRide(rideId, passengerId);
            console.log(`[Rides] Viaje ${rideId} cancelado por pasajero ${passengerId}.`);
            
            // 1. Cerrar campañas abiertas de matching
            matchingService.abortCampaign(rideId);

            // 2. Limpiar rate limits de bids para este viaje
            for (const key of bidRateLimits.keys()) {
                if (key.endsWith(`_${rideId}`)) bidRateLimits.delete(key);
            }

            // 3. Notificar a TODOS los drivers que hicieron bid
            const cancelPayload = { rideId, status: 'CANCELLED', reason: 'PASSENGER_CANCELLED' };
            if (cancelledRide.bids && cancelledRide.bids.length > 0) {
                cancelledRide.bids.forEach(bid => {
                    const bidDriverId = bid.driver?._id ? bid.driver._id.toString() : (bid.driver || '').toString();
                    if (bidDriverId) {
                        getIO().to(bidDriverId).emit('ride:cancelled', cancelPayload);
                    }
                });
            }

            // 4. Si ya había un conductor asignado, liberarlo y notificarlo directamente
            if (cancelledRide.driver) {
                const driverId = cancelledRide.driver._id
                    ? cancelledRide.driver._id.toString()
                    : cancelledRide.driver.toString();
                await User.findByIdAndUpdate(driverId, { driverStatus: 'AVAILABLE' });
                getIO().to(driverId).emit('ride:cancelled', cancelPayload);
                require('../services/notification.service').sendSmartPushNotifications([{
                    userId: driverId,
                    title: 'Viaje Cancelado',
                    body: 'El pasajero ha cancelado el viaje.',
                    data: { rideId }
                }]);
            }

            // 5. Broadcast a la ride room y geo-room
            getIO().to(`ride_${rideId}`).emit('ride:cancelled', cancelPayload);
            getIO().to(`ride_${rideId}`).emit('trip_state_changed', cancelledRide);
            getIO().to(passengerId).emit('trip_state_changed', cancelledRide);
            
            if (isAckRequired) ack({ success: true });
        } catch (error) {
            console.error('[Rides] Error cancelando viaje:', error);
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 4. Controlador de Transición (Ciclo de Vida En Curso)
    socket.on('update_trip_state', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            if (socket.userRole !== 'DRIVER') {
                socket.emit('rideError', { message: 'Acceso denegado. Solo conductores pueden actualizar el estado en ruta.' });
                return;
            }
            
            const { rideId, passengerId, nextStatus, eventId } = payload;
            const driverId = socket.userId;
            
            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            const updatedRide = await rideService.advanceRideStatus(rideId, driverId, nextStatus);
            console.log(`[Trip Progress] Viaje ${rideId} ha mutado al estado: ${nextStatus}`);

            // Si el viaje terminó, liberar al conductor en la cuadrícula de rastreo
            if (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') {
                 await User.findByIdAndUpdate(driverId, { driverStatus: 'AVAILABLE' });
            }

            // El RideService ya inició el paymentService.executeCapture de forma segura mediante Locks
            // en el updateRideStatus, por lo que el socket de usuario responde de forma instantánea.

            // Broadcast to the actual ride room 
            getIO().to(`ride_${rideId}`).emit('trip_state_changed', updatedRide);
            
            // Phase 4: Push notifications
            const notifications = [];
            if (nextStatus === 'ACCEPTED') {
                 notifications.push({ userId: passengerId, title: 'Tu conductor está en camino', body: 'El conductor se dirige a tu ubicación.', data: { rideId } });
            } else if (nextStatus === 'ARRIVED') {
                 notifications.push({ userId: passengerId, title: 'Tu conductor llegó', body: 'Tu conductor llegó al punto de recogida.', data: { rideId } });
            } else if (nextStatus === 'IN_PROGRESS') {
                 notifications.push({ userId: passengerId, title: 'Tu viaje ha comenzado', body: 'El viaje está en curso, ¡disfruta!', data: { rideId } });
            } else if (nextStatus === 'COMPLETED') {
                 notifications.push({ userId: passengerId, title: 'Viaje completado', body: 'Viaje completado. ¡Gracias por usar B-Ride!', data: { rideId } });
                 notifications.push({ userId: driverId, title: 'Viaje completado', body: 'Viaje completado satisfactoriamente.', data: { rideId } });
            }
            if (notifications.length > 0) {
                 require('../services/notification.service').sendSmartPushNotifications(notifications);
            }
            
            // Fallbacks point-to-point just in case
            getIO().to(passengerId).emit('trip_state_changed', updatedRide);
            getIO().to(driverId).emit('trip_state_changed', updatedRide);

            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch (error) {
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 5. Rating: Pasajero califica al conductor tras finalizar el viaje
    socket.on('rate_driver', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId, driverId, fromUserId, score, eventId } = payload;
            
            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            if (score < 1 || score > 5) throw new Error('Puntuación inválida (1-5)');

            // Verificar que el viaje existe y el pasajero participó
            const ride = await require('../models/Ride').findOne({
                _id: rideId, passenger: fromUserId, driver: driverId, status: 'COMPLETED'
            });
            if (!ride) throw new Error('Viaje no válido para calificar');

            // Evitar calificaciones duplicadas para el mismo viaje
            const alreadyRated = await User.findOne({
                _id: driverId,
                'ratings.rideId': rideId
            });
            if (alreadyRated) throw new Error('Ya calificaste este viaje');

            // Actualización atómica: push rating + recalcular avgRating en una operación
            const driver = await User.findById(driverId).select('avgRating totalRatings');
            const newTotal = (driver.totalRatings || 0) + 1;
            const newAvg = (((driver.avgRating || 0) * (driver.totalRatings || 0)) + score) / newTotal;

            await User.findByIdAndUpdate(driverId, {
                $push: { ratings: { score, rideId, from: fromUserId } },
                $set:  { avgRating: Math.round(newAvg * 10) / 10, totalRatings: newTotal }
            });

            console.log(`[Rating] Conductor ${driverId} calificado con ${score}/5 (nuevo avg: ${newAvg.toFixed(1)})`);
            socket.emit('rating_submitted', { success: true, newAvg: Math.round(newAvg * 10) / 10 });
            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch (error) {
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    // 6. Rating: Conductor califica al pasajero tras finalizar el viaje
    socket.on('rate_passenger', async (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId, passengerId, fromUserId, score, eventId } = payload;
            
            if (eventId && await idempotency.isDuplicate(eventId)) {
                if (isAckRequired) ack({ success: true, status: 'duplicate_ignored' });
                return;
            }
            if (score < 1 || score > 5) throw new Error('Puntuación inválida (1-5)');

            const ride = await require('../models/Ride').findOne({
                _id: rideId, passenger: passengerId, driver: fromUserId, status: 'COMPLETED'
            });
            if (!ride) throw new Error('Viaje no válido para calificar');

            const alreadyRated = await User.findOne({
                _id: passengerId,
                'ratings.rideId': rideId
            });
            if (alreadyRated) throw new Error('Ya calificaste este viaje');

            const passenger = await User.findById(passengerId).select('avgRating totalRatings');
            const newTotal = (passenger.totalRatings || 0) + 1;
            const newAvg = (((passenger.avgRating || 0) * (passenger.totalRatings || 0)) + score) / newTotal;

            await User.findByIdAndUpdate(passengerId, {
                $push: { ratings: { score, rideId, from: fromUserId } },
                $set:  { avgRating: Math.round(newAvg * 10) / 10, totalRatings: newTotal }
            });

            console.log(`[Rating] Pasajero ${passengerId} calificado con ${score}/5 (nuevo avg: ${newAvg.toFixed(1)})`);
            socket.emit('rating_submitted', { success: true, newAvg: Math.round(newAvg * 10) / 10 });
            if (isAckRequired) ack({ success: true, status: 'processed' });
        } catch (error) {
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('rideError', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Sockets] Usuario desconectado: ${socket.id}`);
    });
};

module.exports = rideEvents;
