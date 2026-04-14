const router = require('express').Router();
const Report = require('../models/Report');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

/**
 * S5: Crear reporte post-viaje
 * POST /api/reports
 */
router.post('/', async (req, res) => {
    try {
        const { rideId, reportedUserId, type, description, sosData } = req.body;

        if (!rideId || !reportedUserId || !type || !description) {
            return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
        }

        const report = await Report.create({
            rideId,
            reporter: req.user._id,
            reported: reportedUserId,
            type,
            description,
            sosData: sosData || undefined,
        });

        res.status(201).json({ success: true, data: report });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * O1: Mis reportes
 * GET /api/reports/mine
 */
router.get('/mine', async (req, res) => {
    try {
        const reports = await Report.find({ reporter: req.user._id })
            .populate('reported', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: reports });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * S1: Endpoint SOS
 * POST /api/reports/sos
 */
router.post('/sos', async (req, res) => {
    try {
        const { rideId, latitude, longitude } = req.body;

        const report = await Report.create({
            rideId,
            reporter: req.user._id,
            reported: req.body.otherUserId || req.user._id,
            type: 'SOS',
            description: 'Botón SOS activado durante el viaje',
            sosData: { latitude, longitude, timestamp: new Date() },
        });

        // TODO: Enviar push notification de emergencia a admins
        // TODO: Integrar con servicio de emergencias externo

        console.warn(`[SOS] ⚠️ Usuario ${req.user._id} activó SOS en ride ${rideId}`);

        res.status(201).json({ success: true, data: report });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
