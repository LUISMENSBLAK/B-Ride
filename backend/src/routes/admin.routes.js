const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

// Todas las rutas requieren autenticación y rol ADMIN (Bloque 4)
router.use(protect);
router.use(authorize('ADMIN'));

router.get('/drivers/pending', adminController.getPendingDrivers);
router.get('/drivers/active-locations', adminController.getActiveDriverLocations);
router.put('/drivers/:id/approve', adminController.approveDriver);
router.put('/drivers/:id/reject', adminController.rejectDriver);

router.get('/rides', adminController.getAllRides);
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/ban', adminController.banUser);

router.get('/stats', adminController.getStats);

module.exports = router;
