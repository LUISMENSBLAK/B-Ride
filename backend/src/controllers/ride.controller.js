const rideService = require('../services/ride.service');

const getMyRides = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role; // Assuming role is appended to req.user during auth middleware 

        const rides = await rideService.getRideHistory(userId, role);

        res.status(200).json({
            success: true,
            count: rides.length,
            data: rides,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
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

module.exports = {
    getMyRides,
    getRideState
};
