const User = require('../models/User');
const Ride = require('../models/Ride');
const paymentService = require('../services/payment.service');
const { getIO } = require('../sockets');

const getPendingDrivers = async (req, res) => {
    try {
        const drivers = await User.find({ 
            $or: [
                { driverApprovalStatus: { $in: ['DOCS_SUBMITTED', 'UNDER_REVIEW'] } },
                { approvalStatus: { $in: ['DOCS_SUBMITTED', 'UNDER_REVIEW'] } }
            ],
            role: 'DRIVER' 
        }).select('-password -__v');
        res.status(200).json({ success: true, data: drivers });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const approveDriver = async (req, res) => {
    try {
        const driver = await User.findById(req.params.id);
        if (!driver || driver.role !== 'DRIVER') return res.status(404).json({ success: false, message: 'Conductor no encontrado' });

        driver.driverApprovalStatus = 'APPROVED';
        driver.approvalStatus = 'APPROVED'; // Legacy support
        await driver.save();

        getIO().to(driver._id.toString()).emit('admin_approval_status', { status: 'APPROVED' });
        // En una app real aquí se lanza el Push Notification via Expo
        
        res.status(200).json({ success: true, message: 'Conductor aprobado exitosamente.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const rejectDriver = async (req, res) => {
    try {
        const { rejectionReason } = req.body;
        if (!rejectionReason) return res.status(400).json({ success: false, message: 'Motivo de rechazo es obligatorio' });

        const driver = await User.findById(req.params.id);
        if (!driver || driver.role !== 'DRIVER') return res.status(404).json({ success: false, message: 'Conductor no encontrado' });

        driver.driverApprovalStatus = 'REJECTED';
        driver.approvalStatus = 'REJECTED';
        driver.rejectionReason = rejectionReason;
        await driver.save();

        getIO().to(driver._id.toString()).emit('admin_approval_status', { status: 'REJECTED', reason: rejectionReason });
        
        res.status(200).json({ success: true, message: 'Conductor rechazado.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const getAllRides = async (req, res) => {
    try {
        const { status, date, passenger, driver } = req.query;
        let query = {};
        if (status) query.status = status;
        if (passenger) query.passenger = passenger;
        if (driver) query.driver = driver;
        if (date) {
            const start = new Date(date);
            const end = new Date(date); end.setDate(end.getDate() + 1);
            query.createdAt = { $gte: start, $lt: end };
        }

        const pageNum = parseInt(req.query.page, 10) || 1;
        const limitNum = parseInt(req.query.limit, 10) || 20;
        const skip = (pageNum - 1) * limitNum;

        const [rides, total] = await Promise.all([
            Ride.find(query)
                .populate('passenger', 'name email phoneNumber')
                .populate('driver', 'name email phoneNumber')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Ride.countDocuments(query)
        ]);

        res.status(200).json({ 
            success: true, 
            count: rides.length, 
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
            data: rides 
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const { role, isBlocked, date } = req.query;
        let query = {};
        if (role) query.role = role;
        if (isBlocked !== undefined) query.isBlocked = isBlocked === 'true';
        if (date) {
            const start = new Date(date);
            const end = new Date(date); end.setDate(end.getDate() + 1);
            query.createdAt = { $gte: start, $lt: end };
        }

        const pageNum = parseInt(req.query.page, 10) || 1;
        const limitNum = parseInt(req.query.limit, 10) || 20;
        const skip = (pageNum - 1) * limitNum;

        const [users, total] = await Promise.all([
            User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            User.countDocuments(query)
        ]);
        
        res.status(200).json({ 
            success: true, 
            count: users.length, 
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
            data: users 
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const banUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

        user.isBlocked = true;
        await user.save();

        getIO().to(user._id.toString()).emit('force_logout', { message: 'Tu cuenta ha sido suspendida.' });

        res.status(200).json({ success: true, message: 'Usuario baneado.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const pendingDriversCount = await User.countDocuments({ 
            $or: [
                { driverApprovalStatus: { $in: ['DOCS_SUBMITTED', 'UNDER_REVIEW'] } },
                { approvalStatus: { $in: ['DOCS_SUBMITTED', 'UNDER_REVIEW'] } }
            ]
        });
        const activeDriversCount = await User.countDocuments({ driverStatus: 'AVAILABLE' });

        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        
        const ridesToday = await Ride.countDocuments({ createdAt: { $gte: startOfDay } });
        
        const completedRides = await Ride.find({ status: 'COMPLETED' });
        let income = 0;
        completedRides.forEach(r => {
             const acceptedBid = r.bids && r.bids.find(b => b.status === 'ACCEPTED');
             if (acceptedBid) income += Number(acceptedBid.price) || 0;
             else if (r.proposedPrice) income += Number(r.proposedPrice);
        });

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                pendingDriversCount,
                activeDriversCount,
                ridesToday,
                estimatedTotalIncome: income
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const getActiveDriverLocations = async (req, res) => {
    try {
        const drivers = await User.find({ role: 'DRIVER', driverStatus: 'AVAILABLE' })
            .select('name lastKnownLocation vehicle avgRating');
        res.json({ success: true, data: drivers });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getPendingDrivers,
    approveDriver,
    rejectDriver,
    getActiveDriverLocations,
    getAllRides,
    getAllUsers,
    banUser,
    getStats
};
