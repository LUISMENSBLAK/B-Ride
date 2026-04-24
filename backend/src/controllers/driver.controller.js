const { handleError } = require('../utils/errorHandler'); // V2-002

const Ride = require('../models/Ride');
const User = require('../models/User');

const getEarnings = async (req, res) => {
    try {
        const driverId = req.user._id;
        
        // Find all completed rides for this driver
        const rides = await Ride.find({ driver: driverId, status: 'COMPLETED' })
            .select('paymentStatus proposedPrice discountApplied createdAt');
        
        const now = new Date();
        const startOfDay = new Date(now.setHours(0,0,0,0));
        const startOfWeek = new Date(Date.now() - 7*24*60*60*1000);
        const startOfMonth = new Date(Date.now() - 30*24*60*60*1000);

        let todayEarnings = 0, weekEarnings = 0, monthEarnings = 0, totalEarnings = 0;
        let todayRides = 0, weekRides = 0, monthRides = 0, totalRides = rides.length;

        rides.forEach(ride => {
            const finalPrice = ride.proposedPrice - (ride.discountApplied || 0);
            totalEarnings += finalPrice;
            
            if (ride.createdAt >= startOfDay) {
                todayEarnings += finalPrice;
                todayRides++;
            }
            if (ride.createdAt >= startOfWeek) {
                weekEarnings += finalPrice;
                weekRides++;
            }
            if (ride.createdAt >= startOfMonth) {
                monthEarnings += finalPrice;
                monthRides++;
            }
        });
        
        // Let's get the driver rating too

        const driver = await User.findById(driverId).select('avgRating');

        res.status(200).json({
             success: true,
             todayEarnings, weekEarnings, monthEarnings, totalEarnings,
             todayRides, weekRides, monthRides, totalRides,
             avgRating: driver?.avgRating || 0
        });
    } catch (e) {
        handleError(res, e, 500, 'DriverController');
    }
};

module.exports = {
    getEarnings
};
