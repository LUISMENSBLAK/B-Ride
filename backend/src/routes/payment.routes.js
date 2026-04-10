const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const stripeService = require('../services/stripe.service');
const paymentService = require('../services/payment.service');
const obs = require('../services/observability.service');
const User = require('../models/User');
const Ride = require('../models/Ride');
const uuid = require('uuid');

// @route   POST /api/payment/onboard
// @desc    Obtiene el link de Express Onboarding para Conductores
// @access  Private (Driver)
router.post('/onboard', protect, authorize('DRIVER'), async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+stripeAccountId');
        const url = await stripeService.createConnectedAccount(user);
        
        res.status(200).json({ success: true, url });
    } catch (e) {
        console.error('[Payment] Error onboard:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// @route   GET /api/payment/onboard-status
// @desc    Verifica si completó el onboarding refrescando Stripe
// @access  Private (Driver)
router.get('/onboard-status', protect, authorize('DRIVER'), async (req, res) => {
    try {
        const isComplete = await stripeService.verifyOnboarding(req.user._id);
        res.status(200).json({ success: true, onboardingComplete: isComplete });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// @route   GET /api/payment/admin/health
// @desc    Obtener monitor de observabilidad y métricas financieras en BD
// @access  Private (Intervención de operador)
router.get('/admin/health', protect, async (req, res) => {
    try {
        const health = await obs.getFinancialHealth();
        res.status(200).json({ success: true, ...health });
    } catch (e) {
        console.error('[Observability] Falla crítica leyendo Métricas Health:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// @route   POST /api/payment/intent
// @desc    Crea el PaymentIntent (Manual Capture) para retener dinero del Pasajero
// @access  Private (User/Passenger)
router.post('/intent', protect, authorize('USER'), async (req, res) => {
    try {
        const { rideId, bidId, idempotencyKey } = req.body;
        if (!rideId || !bidId) return res.status(400).json({ success: false, message: 'Faltan parámetros' });

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ success: false, message: 'Viaje no encontrado' });

        // Se delega TODA la lógica, importe y validaciones de seguridad a la capa de servicio
        const result = await paymentService.createPaymentIntent(rideId, bidId, req.user._id, idempotencyKey || uuid.v4());

        res.status(200).json({ 
            success: true, 
            clientSecret: result.clientSecret, 
            paymentIntentId: result.paymentIntentId 
        });

    } catch (e) {
        console.error('[Payment] Error intent:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// @route   GET /api/payment/admin/reconcile/:rideId
// @desc    Reconciliación manual (Solo administradores)
// @access  Private (Intervención manual en caso de fallback)
// NOTA: Reemplazar authorize('USER') por tu rol 'ADMIN' cuando se tenga el RBAC general.
router.get('/admin/reconcile/:rideId', protect, async (req, res) => {
    try {
        const { rideId } = req.params;
        const data = await paymentService.reconcilePaymentStatus(rideId);
        
        res.status(200).json({
           success: true,
           message: 'Reconciliación finalizada',
           data
        });
    } catch (e) {
        console.error('[Payment Admin] Error reconcialiando:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// @route   POST /api/payment/admin/refund/:rideId
// @desc    Lanzar un Refund (Parcial o Total) (Solo administradores)
// @access  Private 
router.post('/admin/refund/:rideId', protect, async (req, res) => {
    try {
        const { rideId } = req.params;
        const { amount, reason, idempotencyKey } = req.body;

        if (!amount || amount <= 0) {
             return res.status(400).json({ success: false, message: 'Provide a valid refund amount' });
        }

        const refund = await paymentService.executeRefund(rideId, amount, reason, idempotencyKey);
        
        res.status(200).json({
           success: true,
           message: 'Refund emitido a Stripe y en procesamiento',
           refundId: refund.id
        });
    } catch (e) {
        console.error('[Payment Admin] Error en refund:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
