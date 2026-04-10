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

module.exports = router;
