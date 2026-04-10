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

        const { email, password } = req.body;

        const result = await authService.login(email, password);
        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message,
        });
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

        if (!token) {
            return res.status(401).json({ success: false, message: 'Refresh token is required' });
        }

        const { verifyRefreshToken, generateAccessToken } = require('../utils/jwtUtils');

        // Verify refresh token
        const decoded = verifyRefreshToken(token);

        const user = await require('../models/User').findById(decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        // Generate new access token
        const newAccessToken = generateAccessToken(user._id);

        res.status(200).json({
            success: true,
            accessToken: newAccessToken
        });
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
};

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
    removePushToken
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
