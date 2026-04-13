const express = require('express');
const { getMyRides } = require('../controllers/ride.controller');
const { protect } = require('../middlewares/auth.middleware');
const pricingService = require('../services/pricing.service');

const router = express.Router();

// Get the rides for the currently authenticated user
router.get('/history', protect, getMyRides);

// Get ride sync state
router.get('/:id/state', protect, require('../controllers/ride.controller').getRideState);

// Rate ride
router.post('/:id/rate', protect, require('../controllers/ride.controller').rateRide);

// Phase 14: Public Tracker endpoint
router.get('/:id/track', require('../controllers/ride.controller').trackRide);

// Scheduled Ride
router.post('/schedule', protect, async (req, res) => {
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
router.get('/estimate', protect, async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.query;
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      return res.status(400).json({ success: false, message: 'Coordenadas incompletas' });
    }
    const pricingService = require('../services/pricing.service');
    const result = pricingService.estimateAllCategories(
      parseFloat(pickupLat), parseFloat(pickupLng),
      parseFloat(dropoffLat), parseFloat(dropoffLng)
    );
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/:rideId/comment', protect, async (req, res) => {
  try {
    const { text, tags } = req.body;
    const ride = await require('../models/Ride').findById(req.params.rideId);
    
    if (!ride) return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
    if (ride.status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'Solo puedes comentar viajes completados' });

    const userId = req.user._id.toString();
    const isPassenger = ride.passenger.toString() === userId;
    const isDriver    = ride.driver?.toString() === userId;

    if (!isPassenger && !isDriver) {
      return res.status(403).json({ success: false, message: 'No eres parte de este viaje' });
    }

    if (isPassenger) {
      ride.passengerComment = { text, tags: tags || [], postedAt: new Date() };
    } else {
      ride.driverComment = { text, tags: tags || [], postedAt: new Date() };
    }

    await ride.save();
    res.json({ success: true, message: 'Comentario guardado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
