const express = require('express');
const { registerUser, loginUser, getMe, forgotPassword, resetPassword, refreshToken } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/verify-email', require('../controllers/auth.controller').verifyEmail);
router.post('/logout-all', protect, require('../controllers/auth.controller').logoutAll);
router.get('/me', protect, getMe);
router.post('/forgotpassword', forgotPassword);
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

module.exports = router;
