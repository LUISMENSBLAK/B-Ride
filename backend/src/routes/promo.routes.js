const express = require('express');
const router = express.Router();
const Promo = require('../models/Promo');
const { protect, authorize } = require('../middlewares/auth.middleware');

// Public validation for passengers
router.post('/validate', protect, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Código requerido' });
        
        const promo = await Promo.findOne({ code: code.toUpperCase(), isActive: true });
        if (!promo) return res.status(404).json({ success: false, message: 'Código no válido o inactivo' });
        
        const now = new Date();
        if (now < promo.startDate || now > promo.endDate) {
            return res.status(400).json({ success: false, message: 'El código promocional ha expirado o no está activo aún' });
        }
        if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) {
            return res.status(400).json({ success: false, message: 'El código promocional agotó su límite de usos' });
        }
        res.status(200).json({ success: true, data: promo });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Admin Management
router.post('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const data = { ...req.body, code: req.body.code.toUpperCase() };
        const promo = await Promo.create(data);
        res.status(201).json({ success: true, data: promo });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const promos = await Promo.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: promos });
    } catch(e) {
         res.status(500).json({ success: false, message: e.message });
    }
});

router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        if (req.body.code) req.body.code = req.body.code.toUpperCase();
        const promo = await Promo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: promo });
    } catch(e) {
         res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
