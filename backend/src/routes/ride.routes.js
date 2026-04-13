const express = require('express');
const { getMyRides } = require('../controllers/ride.controller');
const { protect, requireVerified } = require('../middlewares/auth.middleware');
const pricingService = require('../services/pricing.service');

const router = express.Router();

// Get the rides for the currently authenticated user
router.get('/history', protect, requireVerified, getMyRides);

// Get ride sync state
router.get('/:id/state', protect, requireVerified, require('../controllers/ride.controller').getRideState);

// Rate ride
router.post('/:id/rate', protect, requireVerified, require('../controllers/ride.controller').rateRide);

// Phase 14: Public Tracker endpoint
router.get('/:id/track', require('../controllers/ride.controller').trackRide);

// Scheduled Ride
router.post('/schedule', protect, requireVerified, async (req, res) => {
  try {
    const { pickupLocation, dropoffLocation, proposedPrice, scheduledAt } = req.body;
    if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Fecha programada debe ser futura' });
    }
    const Ride = require('../models/Ride');
    const ride = await Ride.create({
      passenger: req.user._id,
      pickupLocation,
      dropoffLocation,
      proposedPrice,
      isScheduled: true,
      scheduledAt: new Date(scheduledAt),
      status: 'SCHEDULED'
    });
    res.status(201).json({ success: true, data: ride });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// SOS (Bloque 7)
router.post('/:rideId/sos', protect, require('../controllers/ride.controller').sosTrigger);

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
