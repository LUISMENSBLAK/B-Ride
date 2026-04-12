const Ride = require('../models/Ride');

const getEarnings = async (req, res) => {
    try {
        const driverId = req.user._id;
        
        // Find all completed rides for this driver
        const rides = await Ride.find({ driver: driverId, status: 'COMPLETED' }).select('paymentStatus proposedPrice discountApplied');
        
        const totalEarnings = rides.reduce((acc, ride) => {
             // Ganancia restando el descuento (asumiendo que B-Ride lo asume o el driver, por ahora calculo bruto)
             const finalPrice = ride.proposedPrice - (ride.discountApplied || 0);
             return acc + finalPrice;
        }, 0);
        
        res.status(200).json({
             success: true,
             totalEarnings,
             totalRides: rides.length
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getEarnings
};
