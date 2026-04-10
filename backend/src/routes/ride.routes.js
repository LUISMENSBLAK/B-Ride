const express = require('express');
const { getMyRides } = require('../controllers/ride.controller');
const { protect } = require('../middlewares/auth.middleware');
const pricingService = require('../services/pricing.service');

const router = express.Router();

// Get the rides for the currently authenticated user
router.get('/history', protect, getMyRides);

// Get ride sync state
router.get('/:id/state', protect, require('../controllers/ride.controller').getRideState);

// Estimate Price con Surge Module (Desacoplado)
router.post('/estimate', protect, (req, res) => {
    try {
        const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
        
        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({ error: 'Faltan coordenadas requeridas (pickupLat, pickupLng, dropoffLat, dropoffLng)' });
        }
        
        const estimate = pricingService.estimateRide(pickupLat, pickupLng, dropoffLat, dropoffLng);
        res.status(200).json({ success: true, data: estimate });
    } catch (e) {
        console.error('[Pricing] Failed to calculate estimate:', e.message);
        res.status(500).json({ error: 'Failed to calculate estimate' });
    }
});

module.exports = router;
