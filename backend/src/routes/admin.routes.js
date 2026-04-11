const router = require('express').Router();
const User = require('../models/User');
const Report = require('../models/Report');
const { protect, authorize } = require('../middlewares/auth.middleware');

/**
 * A1: Rutas de administración de conductores
 */

// Middleware: solo ADMIN
router.use(protect);
router.use(authorize('ADMIN'));

// GET /api/admin/drivers/pending — Conductores pendientes de aprobación
router.get('/drivers/pending', async (req, res) => {
    try {
        const drivers = await User.find({
            role: 'DRIVER',
            approvalStatus: { $in: ['PENDING_DOCS', 'UNDER_REVIEW'] }
        }).select('name email phoneNumber vehicle documents approvalStatus createdAt');

        res.json({ success: true, data: drivers });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/admin/drivers — Todos los conductores
router.get('/drivers', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = { role: 'DRIVER' };
        if (status) filter.approvalStatus = status;

        const drivers = await User.find(filter)
            .select('name email phoneNumber vehicle approvalStatus driverStatus avgRating isBlocked createdAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await User.countDocuments(filter);
        res.json({ success: true, data: drivers, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/admin/drivers/:id/approve
router.put('/drivers/:id/approve', async (req, res) => {
    try {
        const driver = await User.findByIdAndUpdate(
            req.params.id,
            { approvalStatus: 'APPROVED', rejectionReason: null },
            { new: true }
        ).select('name email approvalStatus');

        if (!driver) return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
        res.json({ success: true, data: driver });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/admin/drivers/:id/reject
router.put('/drivers/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const driver = await User.findByIdAndUpdate(
            req.params.id,
            { approvalStatus: 'REJECTED', rejectionReason: reason || 'No cumple requisitos' },
            { new: true }
        ).select('name email approvalStatus rejectionReason');

        if (!driver) return res.status(404).json({ success: false, message: 'Conductor no encontrado' });
        res.json({ success: true, data: driver });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/admin/users/:id/block
router.put('/users/:id/block', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isBlocked: true },
            { new: true }
        ).select('name email isBlocked');
        res.json({ success: true, data: user });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/admin/users/:id/unblock
router.put('/users/:id/unblock', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isBlocked: false },
            { new: true }
        ).select('name email isBlocked');
        res.json({ success: true, data: user });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/admin/reports — Todos los reportes/incidencias
router.get('/reports', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) filter.status = status;

        const reports = await Report.find(filter)
            .populate('reporter', 'name email')
            .populate('reported', 'name email')
            .populate('rideId', 'status createdAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Report.countDocuments(filter);
        res.json({ success: true, data: reports, total });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/admin/reports/:id/resolve
router.put('/reports/:id/resolve', async (req, res) => {
    try {
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            { status: 'RESOLVED', resolution: req.body.resolution || 'Resuelto' },
            { new: true }
        );
        res.json({ success: true, data: report });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/admin/stats — Dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalDrivers, pendingDrivers, openReports, activeRides] = await Promise.all([
            User.countDocuments({ role: 'USER' }),
            User.countDocuments({ role: 'DRIVER' }),
            User.countDocuments({ role: 'DRIVER', approvalStatus: { $in: ['PENDING_DOCS', 'UNDER_REVIEW'] } }),
            Report.countDocuments({ status: 'OPEN' }),
            require('../models/Ride').countDocuments({ status: { $in: ['ACCEPTED', 'IN_PROGRESS'] } }),
        ]);
        res.json({ success: true, data: { totalUsers, totalDrivers, pendingDrivers, openReports, activeRides } });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
