
const rideService = require('../services/ride.service');
const Ride = require('../models/Ride');
const SOS = require('../models/SOS');
const { getIO } = require('../sockets');
const sendEmail = require('../utils/sendEmail');
const User = require('../models/User');
const locationCacheModule = require('../services/locationCache.service');

const getMyRides = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role; 


        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const skip = (page - 1) * limit;

        const query = role === 'DRIVER' ? { driver: userId } : { passenger: userId };
        

        const rides = await Ride.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('driver', 'name avatarUrl avgRating')
            .populate('passenger', 'name avatarUrl avgRating');

        const total = await Ride.countDocuments(query);

        res.status(200).json({
            success: true,
            count: rides.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: rides,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getRideState = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id)
            .select('status version bids driver passenger')
            .populate('driver', 'name email phoneNumber')
            .populate('bids.driver', 'name avgRating');
            
        if (!ride) return res.status(404).json({ success: false, message: 'Viaje no encontrado' });

        // 4. Validación de ownership en endpoint de rides/payment
        const isPassenger = ride.passenger.toString() === req.user._id.toString();
        const isDriver = ride.driver && ride.driver._id.toString() === req.user._id.toString();
        // Allow driver who has a pending bid to see the state to avoid breaking negotiated states
        const hasBid = ride.bids && ride.bids.some(b => b.driver && b.driver._id.toString() === req.user._id.toString());

        if (!isPassenger && !isDriver && !hasBid) {
            return res.status(403).json({ success: false, message: 'Acceso denegado al viaje' });
        }

        // Enviar solo la oferta seleccionada y el estado actual para sync
        const selectedBid = ride.bids.find(b => b.status === 'ACCEPTED') || null;

        res.status(200).json({
            success: true,
            data: {
                status: ride.status,
                version: ride.version,
                driver: ride.driver,
                selectedBid
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const sosTrigger = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { location } = req.body;
        
        if (!rideId) return res.status(400).json({ success: false, message: 'rideId requerido' });


        const sosAlert = await SOS.create({
            ride: rideId,
            user: req.user._id,
            location: {
                type: 'Point',
                coordinates: location && location.longitude ? [location.longitude, location.latitude] : [0, 0]
            }
        });

        // Emitir evento por socket room

        try {
            getIO().to(`ride_${rideId}`).emit('sos_triggered', { 
                rideId, 
                userId: req.user._id,
                message: '¡Emergencia activada en este viaje!'
            });
        } catch(e) {}

        // Enviar email a soporte
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@brideapp.com';

        await sendEmail({
            email: supportEmail,
            subject: '🚨 EMERGENCIA SOS — B-Ride',
            message: `SOS activado por usuario ID: ${req.user._id} en viaje ${rideId}. Coordenadas: ${JSON.stringify(location)}`
        });

        res.status(200).json({ success: true, message: 'SOS registrado. Autoridades notificadas.' });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

const rateRide = async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        const rideId = req.params.id;
        
        if (rating === undefined || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating válido entre 1 y 5 es requerido' });
        }



        const ride = await Ride.findById(rideId);
        
        if (!ride) return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        if (ride.status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'Solo viajes completados pueden ser calificados' });
        
        const isPassenger = ride.passenger.toString() === req.user._id.toString();
        const isDriver = ride.driver && ride.driver.toString() === req.user._id.toString();
        
        if (!isPassenger && !isDriver) return res.status(403).json({ success: false, message: 'No fuiste parte de este viaje' });
        
        const targetUserId = isPassenger ? ride.driver : ride.passenger;
        if (!targetUserId) return res.status(400).json({ success: false, message: 'No hay usuario para calificar' });

        const targetUser = await User.findById(targetUserId);
        
        if (!targetUser.ratings) targetUser.ratings = [];
        targetUser.ratings.push({
            rideId: ride._id,
            from: req.user._id,
            score: rating
        });
        
        targetUser.totalRatings = targetUser.ratings.length;
        const sum = targetUser.ratings.reduce((acc, curr) => acc + curr.score, 0);
        targetUser.avgRating = sum / targetUser.totalRatings;
        
        await targetUser.save();
        
        try {

            getIO().to(targetUser._id.toString()).emit('rating_received', { rideId: ride._id, score: rating, feedback });
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Rating guardado correctamente' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const trackRide = async (req, res) => {
    try {
        const rideId = req.params.id;


        const ride = await Ride.findById(rideId).populate('driver', 'name vehicle driverStatus');
        
        if (!ride) return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
        
        let currentLoc = null;
        if (ride.driver) currentLoc = locationCacheModule.cache.get(ride.driver._id.toString());
        
        res.status(200).json({
             success: true,
             data: {
                  status: ride.status, pickup: ride.pickupLocation.address, dropoff: ride.dropoffLocation.address,
                  driver: ride.driver ? {
                       name: ride.driver.name.split(' ')[0], vehicle: ride.driver.vehicle, location: currentLoc || null
                  } : null
             }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getMyRides,
    getRideState,
    sosTrigger,
    rateRide,
    trackRide
};
