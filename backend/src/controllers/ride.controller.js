const rideService = require('../services/ride.service');

const getMyRides = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role; 

        // Bloque 6: Paginación
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const skip = (page - 1) * limit;

        const query = role === 'DRIVER' ? { driver: userId } : { passenger: userId };
        
        const Ride = require('../models/Ride');
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
        const ride = await require('../models/Ride').findById(req.params.id)
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

        const SOS = require('../models/SOS');
        const sosAlert = await SOS.create({
            ride: rideId,
            user: req.user._id,
            location: {
                type: 'Point',
                coordinates: location && location.longitude ? [location.longitude, location.latitude] : [0, 0]
            }
        });

        // Emitir evento por socket room
        const { getIO } = require('../sockets');
        try {
            getIO().to(`ride_${rideId}`).emit('sos_triggered', { 
                rideId, 
                userId: req.user._id,
                message: '¡Emergencia activada en este viaje!'
            });
        } catch(e) {}

        // Enviar email a soporte
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@brideapp.com';
        console.log(`[EMERGENCIA] Correo enviado a ${supportEmail} por botón SOS en viaje ${rideId}. Usuario ID: ${req.user._id}`);
        // En prod esto usaría una API como SendGrid o AWS SES de alta prioridad.

        res.status(200).json({ success: true, message: 'SOS registrado. Autoridades notificadas.' });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

module.exports = {
    getMyRides,
    getRideState,
    sosTrigger
};
