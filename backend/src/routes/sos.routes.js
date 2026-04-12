const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const SOS = require('../models/SOS');
const { getIO } = require('../sockets');
const router = express.Router();

router.post('/', protect, async (req, res) => {
    try {
        const { rideId, latitude, longitude } = req.body;
        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Coordenadas requeridas para activar SOS' });
        }

        const alert = await SOS.create({
            user: req.user._id,
            ride: rideId || null,
            coordinates: { latitude, longitude }
        });

        // Emit to admin room
        try {
            getIO().to('admins').emit('sos_alert', {
                alertId: alert._id,
                userId: req.user._id,
                rideId: rideId,
                coordinates: { latitude, longitude },
                timestamp: alert.createdAt
            });
        } catch (e) {
            console.error('[SOS Socket Error]', e);
        }

        // B-Ride rule: Push to admins
        try {
            const User = require('../models/User');
            const admins = await User.find({ role: 'ADMIN' });
            const pushService = require('../services/pushNotification.service');
            const adminIds = admins.map(a => a._id.toString());
            await pushService.sendToUsers(adminIds, 'SOS', { userName: req.user.name });
        } catch (pushErr) {
            console.error('[Push SOS Error]', pushErr);
        }
        
        res.status(201).json({ success: true, message: 'SOS Activado', data: alert });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const alerts = await SOS.find().sort({ createdAt: -1 }).populate('user', 'name email phoneNumber role');
        res.status(200).json({ success: true, count: alerts.length, data: alerts });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put('/:id/resolve', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const { resolutionNote } = req.body;
        const alert = await SOS.findByIdAndUpdate(req.params.id, {
            status: 'RESOLVED',
            resolutionNote: resolutionNote || 'Resuelto sin notas',
            resolvedBy: req.user._id,
            resolvedAt: Date.now()
        }, { new: true });
        
        if (!alert) return res.status(404).json({ success: false, message: 'Alerta no encontrada' });
        
        res.status(200).json({ success: true, data: alert });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
