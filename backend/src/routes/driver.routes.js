const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const driverIncentiveService = require('../services/driverIncentive.service');

const router = express.Router();

// Obtener HeatZones dinámicas (High demand areas)
router.get('/heat-zones', protect, (req, res) => {
    try {
        const zones = driverIncentiveService.getGlobalHeatZones();
        res.status(200).json({ success: true, count: zones.length, data: zones });
    } catch (e) {
        console.error('[DriverRoutes] GET heat-zones falló:', e.message);
        res.status(500).json({ error: 'Fallo al procesar las zonas calientes' });
    }
});

// Agregar Earnings endpoint (Phase 12)
router.get('/earnings', protect, require('../controllers/driver.controller').getEarnings);

// MEJORA-3: Commission rate endpoint — configurable via env sin re-deploy
router.get('/commission-rate', protect, (req, res) => {
    const rate = parseFloat(process.env.DRIVER_COMMISSION_RATE ?? '0.80');
    // Sanitize: must be between 0.01 and 1.00
    const safeRate = Math.min(1.0, Math.max(0.01, isNaN(rate) ? 0.80 : rate));
    res.status(200).json({
        success: true,
        data: {
            commissionRate: safeRate,
            displayPercentage: Math.round(safeRate * 100),
        }
    });
});

module.exports = router;
