const authService = require('../services/auth.service');
const { registerValidation, loginValidation } = require('../validations/auth.validation');

const registerUser = async (req, res) => {
    try {
        // Validate payload
        const { error } = registerValidation(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const result = await authService.register(req.body);
        res.status(201).json({
            success: true,
            data: result,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

const loginUser = async (req, res) => {
    try {
        // Validate payload
        const { error } = loginValidation(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { email, password, deviceId, deviceName, platform } = req.body;

        const result = await authService.login(email, password, { deviceId, deviceName, platform });
        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error.code === 403 || error.message.includes('NOT_VERIFIED')) {
             return res.status(403).json({ success: false, message: 'El email no ha sido verificado. Te enviamos un nuevo código.', code: 'NOT_VERIFIED' });
        }
        res.status(401).json({
            success: false,
            message: error.message,
        });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ success: false, message: 'Email and code required' });

        const User = require('../models/User');
        const user = await User.findOne({ email }).select('+emailVerificationToken +emailVerificationExpires');
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.isEmailVerified || user.emailVerified) return res.status(400).json({ success: false, message: 'Already verified' });
        
        if (user.emailVerificationExpires < Date.now()) {
             return res.status(400).json({ success: false, message: 'Code expired. Please login again to receive a new one.' });
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(code, user.emailVerificationToken);
        
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid code' });

        user.isEmailVerified = true;
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        const { generateAccessToken, generateRefreshToken } = require('../utils/jwtUtils');
        const RefreshToken = require('../models/RefreshToken');
        const uuid = require('uuid');

        const accessToken = generateAccessToken(user._id);
        const rawRefreshToken = generateRefreshToken(user._id);

        const familyId = uuid.v4();
        await RefreshToken.create({
            token: rawRefreshToken,
            user: user._id,
            familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        res.status(200).json({
            success: true,
            data: {
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                approvalStatus: user.driverApprovalStatus || user.approvalStatus,
                accessToken,
                refreshToken: rawRefreshToken,
            }
        });

    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// @desc    Get current user info
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    res.status(200).json({
        success: true,
        data: req.user,
    });
};

const forgotPassword = async (req, res) => {
    try {
        const user = await require('../models/User').findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ success: false, message: 'There is no user with that email' });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();

        await require('../models/User').updateOne(
            { _id: user._id },
            { $set: { resetPasswordToken: user.resetPasswordToken, resetPasswordExpire: user.resetPasswordExpire } }
        );

        // Create reset URL
        const resetUrl = `${req.protocol}://${req.get('host')}/api/auth/resetpassword/${resetToken}`;

        const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;
        console.log(`[DEV ONLY] Reset URL: ${resetUrl}`);

        try {
            await require('../utils/sendEmail')({
                email: user.email,
                subject: 'Password reset token',
                message,
            });

            res.status(200).json({ success: true, data: 'Email sent' });
        } catch (err) {
            console.error(err);
            // user.resetPasswordToken = undefined;
            // user.resetPasswordExpire = undefined;

            await user.save({ validateBeforeSave: false });

            return res.status(500).json({ success: false, message: 'Email could not be sent' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const crypto = require('crypto');
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await require('../models/User').findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid token' });
        }

        // Set new password
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        const { generateAccessToken, generateRefreshToken } = require('../utils/jwtUtils');
        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.status(200).json({
            success: true,
            accessToken,
            refreshToken
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(401).json({ success: false, message: 'Refresh token is required' });

        const { verifyRefreshToken, generateAccessToken, generateRefreshToken } = require('../utils/jwtUtils');
        const RefreshToken = require('../models/RefreshToken');
        
        let decoded;
        try {
            decoded = verifyRefreshToken(token);
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        // B2: Verificación de familia y blacklisting
        const dbToken = await RefreshToken.findOne({ token });
        if (!dbToken) return res.status(401).json({ success: false, message: 'Token not found or invalidated' });

        if (dbToken.used) {
            // ALERTA DE RE-USO DE TOKEN ROBADO! Invalidar toda la familia
            await RefreshToken.updateMany({ familyId: dbToken.familyId }, { $set: { used: true } });
            console.log(`[Seguridad] Re-uso de token detectado para user ${dbToken.user}. Familia invalidada.`);
            return res.status(401).json({ success: false, message: 'Token compromise detected. Please login again.' });
        }

        // Marcar este token como usado (Rotación)
        dbToken.used = true;
        await dbToken.save();

        const user = await require('../models/User').findById(decoded.id);
        if (!user || user.isBanned) return res.status(401).json({ success: false, message: 'User not found or banned' });

        const newAccessToken = generateAccessToken(user._id);
        const newRefreshTokenRaw = generateRefreshToken(user._id);

        // Crear el nuevo refresh token asociado a la misma familia
        await RefreshToken.create({
            token: newRefreshTokenRaw,
            user: user._id,
            familyId: dbToken.familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        res.status(200).json({
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshTokenRaw
        });
    } catch (error) {
        res.status(401).json({ success: false, message: 'Internal Server Error refreshing token' });
    }
};

const logoutAll = async (req, res) => {
    try {
        const RefreshToken = require('../models/RefreshToken');
        // Marcar todos los tokens de este usuario como USADOS
        await RefreshToken.updateMany({ user: req.user._id }, { $set: { used: true } });
        
        // B2: Emitir evento por sockets para force logout sincrono 
        const { getIO } = require('../sockets');
        try {
            getIO().to(req.user._id.toString()).emit('force_logout', { message: 'Se cerró sesión desde otro dispositivo.' });
        } catch (e) {
            // Puede que el socket io no este inicializado en los tests
        }

        res.status(200).json({ success: true, message: 'Cerrado en todos los dispositivos.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

const updatePushToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token required' });
        
        await require('../models/User').findByIdAndUpdate(req.user._id, {
            $addToSet: { expoPushTokens: token }
        });

        res.status(200).json({
            success: true,
            message: 'Push token added successfully'
        });
    } catch (error) {
        console.error('[Auth Controller] Error updating push token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const removePushToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token required' });
        
        await require('../models/User').findByIdAndUpdate(req.user._id, {
            $pull: { expoPushTokens: token }
        });

        res.status(200).json({
            success: true,
            message: 'Push token removed successfully'
        });
    } catch (error) {
        console.error('[Auth Controller] Error removing push token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    forgotPassword,
    resetPassword,
    refreshToken,
    updatePushToken,
    removePushToken,
    verifyEmail,
    logoutAll
};

const uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        // Multer saved it to public/uploads/
        const fileName = req.file.filename;

        // CDN Layer (Optional for Production Hardening)
        const CDN_URL = process.env.CDN_URL || null;
        let avatarUrl = '';
        if (CDN_URL) {
             // Si el S3 bucket/CDN via env existe, lo mapea al CDN.
             avatarUrl = `${CDN_URL}/uploads/${fileName}`;
        } else {
             // Fallback al host de la app local
             avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
        }

        const User = require('../models/User');
        const updatedUser = await User.findByIdAndUpdate(req.user._id, { avatarUrl }, { new: true });

        res.status(200).json({
            success: true,
            avatarUrl: updatedUser.avatarUrl,
            data: updatedUser
        });
    } catch (error) {
        console.error('[Auth Controller] Error uploading avatar:', error);
        res.status(500).json({ success: false, message: 'Server error uploading avatar' });
    }
};

module.exports.uploadAvatar = uploadAvatar;

/**
 * V1/V2/S4/UX-B: Actualizar perfil del usuario.
 * Permite actualizar: name, phoneNumber, vehicle, documents, emergencyContact,
 * savedAddresses, approvalStatus, etc.
 */
const updateProfile = async (req, res) => {
    try {
        const User = require('../models/User');

        // Campos permitidos para actualización
        const allowedFields = [
            'name', 'phoneNumber',
            'vehicle', 'documents', 'approvalStatus',
            'emergencyContact', 'savedAddresses',
        ];

        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        // Seguridad: un usuario no puede auto-aprobarse
        if (updateData.approvalStatus && updateData.approvalStatus === 'APPROVED') {
            delete updateData.approvalStatus;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('[Auth Controller] Error updating profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports.updateProfile = updateProfile;

