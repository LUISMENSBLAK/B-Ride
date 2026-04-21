const express = require('express');
const { registerUser, loginUser, getMe, forgotPassword, resetPassword, refreshToken } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit'); // MEJORA-1: Rate limiting en auth

const router = express.Router();

// MEJORA-1: Limitadores para endpoints críticos de auth
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5,
    message: { success: false, message: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 20,
    message: { success: false, message: 'Demasiados registros desde esta IP. Intenta de nuevo en 1 hora.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/google', require('../controllers/auth.controller').googleLogin);
router.post('/apple', require('../controllers/auth.controller').appleLogin);
router.post('/verify-email', require('../controllers/auth.controller').verifyEmail);
router.post('/resend-verification', require('../controllers/auth.controller').resendVerification);

// V2: SMS OTP
router.post('/send-phone-otp', protect, require('../controllers/auth.controller').sendPhoneOtp);
router.post('/verify-phone-otp', protect, require('../controllers/auth.controller').verifyPhoneOtp);

router.post('/logout-all', protect, require('../controllers/auth.controller').logoutAll);
router.delete('/account', protect, require('../controllers/auth.controller').deleteAccount);
router.get('/referral', protect, require('../controllers/auth.controller').getReferral);
router.get('/me', protect, getMe);
router.post('/forgotpassword', forgotLimiter, forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Configuración de multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads');
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `avatar_${req.user._id}_${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/refresh', refreshToken);
router.put('/push-token', protect, require('../controllers/auth.controller').updatePushToken);
router.delete('/push-token', protect, require('../controllers/auth.controller').removePushToken);
router.post('/profile/avatar', protect, upload.single('avatar'), require('../controllers/auth.controller').uploadAvatar);

// V1/V2/S4/UX-B: Actualizar perfil (vehículo, contacto emergencia, direcciones, etc.)
router.put('/profile', protect, require('../controllers/auth.controller').updateProfile);

// Firebase Auth sync — llamado tras signIn exitoso en el frontend
router.post('/firebase-sync', require('../middlewares/auth.middleware').protect, require('../controllers/auth.controller').firebaseSync);

// Firebase Phone Verification — confirma número verificado vía Firebase Phone Auth
router.post('/verify-phone-firebase',
  require('../middlewares/auth.middleware').protect,
  async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'phoneNumber requerido' });
      }
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user._id, {
        phoneNumber,
        phoneVerified: true,
        verificationOTP: undefined,
        verificationOTPExpire: undefined,
      });
      res.json({ success: true, message: 'Teléfono verificado con Firebase' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

module.exports = router;
