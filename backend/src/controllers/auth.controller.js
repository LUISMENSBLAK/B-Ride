const authService = require('../services/auth.service');
const { registerValidation, loginValidation } = require('../validations/auth.validation');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuid = require('uuid');
const { getIO } = require('../sockets');
const sendEmail = require('../utils/sendEmail');
const sendSMS = require('../utils/sendSMS');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwtUtils');
const fetch = require('node-fetch');

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

        const user = await User.findOne({ email }).select('+emailVerificationToken +emailVerificationExpires');
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.isEmailVerified || user.emailVerified) return res.status(400).json({ success: false, message: 'Already verified' });
        
        if (user.emailVerificationExpires < Date.now()) {
             return res.status(400).json({ success: false, message: 'Code expired. Please login again to receive a new one.' });
        }

        const isMatch = await bcrypt.compare(code, user.emailVerificationToken);
        
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid code' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();


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
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ success: false, message: 'There is no user with that email' });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();

        await User.updateOne(
            { _id: user._id },
            { $set: { resetPasswordToken: user.resetPasswordToken, resetPasswordExpire: user.resetPasswordExpire } }
        );

        // Build reset URL from env to prevent header injection via X-Forwarded-Host
        const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

        const message = `Alguien ha solicitado restablecer la contraseña para tu cuenta de B-Ride.<br/><br/>
            Por favor haz clic en el siguiente enlace para continuar:<br/><br/>
            <a href="${resetUrl}" style="background-color: #F5C518; color: #0D0520; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Restablecer contraseña - B-Ride',
                message,
            });

            res.status(200).json({ success: true, data: 'Email sent' });
        } catch (err) {
            console.error('[Auth] forgotPassword email send failed:', err.message);
            // Token cleanup: revoke token if email could not be sent
            await User.updateOne(
                { _id: user._id },
                { $unset: { resetPasswordToken: '', resetPasswordExpire: '' } }
            );

            return res.status(500).json({ success: false, message: 'Email could not be sent' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid token' });
        }

        // Set new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

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

            return res.status(401).json({ success: false, message: 'Token compromise detected. Please login again.' });
        }

        // Marcar este token como usado (Rotación)
        dbToken.used = true;
        await dbToken.save();

        const user = await User.findById(decoded.id);
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
        // Marcar todos los tokens de este usuario como USADOS
        await RefreshToken.updateMany({ user: req.user._id }, { $set: { used: true } });
        
        // B2: Emitir evento por sockets para force logout sincrono 
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
        
        await User.findByIdAndUpdate(req.user._id, {
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
        
        await User.findByIdAndUpdate(req.user._id, {
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



/**
 * Actualizar perfil del usuario.
 * Permite actualizar: name, phoneNumber, vehicle, documents, emergencyContact,
 * savedAddresses, approvalStatus, etc.
 */
const updateProfile = async (req, res) => {
    try {

        // Campos permitidos para actualización
        const allowedFields = [
            'name', 'phoneNumber',
            'vehicle', 'documents', 'approvalStatus', 'driverApprovalStatus',
            'emergencyContact', 'savedAddresses',
        ];

        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        // Sincronizar legacy
        if (updateData.approvalStatus && !updateData.driverApprovalStatus) {
            updateData.driverApprovalStatus = updateData.approvalStatus;
        } else if (updateData.driverApprovalStatus && !updateData.approvalStatus) {
            updateData.approvalStatus = updateData.driverApprovalStatus;
        }

        // Seguridad: un usuario no puede auto-aprobarse
        if (updateData.approvalStatus === 'APPROVED' || updateData.driverApprovalStatus === 'APPROVED') {
            delete updateData.approvalStatus;
            delete updateData.driverApprovalStatus;
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



const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });

        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        if (user.isEmailVerified || user.emailVerified) return res.status(400).json({ success: false, message: 'El correo ya está verificado' });

        const salt = await bcrypt.genSalt(10);
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        user.emailVerificationToken = await bcrypt.hash(verifyCode, salt);
        user.emailVerificationExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        try {
            await sendEmail({
                email,
                subject: 'Reenvío de código de verificación - B-Ride',
                message: 'Aquí está tu nuevo código de verificación. Úsalo en la aplicación para activar tu cuenta.',
                code: verifyCode
            });
        } catch (emailError) {
            // Do NOT log the OTP code in production — it would appear in log aggregators
            console.error('[Auth] resendVerification: email send failed:', emailError.message);
        }

        res.status(200).json({ success: true, message: 'Código reenviado correctamente' });
    } catch (error) {
        console.error('[Auth Controller] resendVerification error:', error);
        res.status(500).json({ success: false, message: 'Error interno al reenviar el código' });
    }
};



const sendPhoneOtp = async (req, res) => {
    try {
        const user = req.user;
        if (!user.phoneNumber) {
            return res.status(400).json({ success: false, message: 'Usuario no tiene número de teléfono registrado.' });
        }
        
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const salt = await bcrypt.genSalt(10);
        
        user.verificationOTP = await bcrypt.hash(verifyCode, salt);
        user.verificationOTPExpire = Date.now() + 10 * 60 * 1000;
        await user.save();
        
        const smsSent = await sendSMS(user.phoneNumber, `[B-Ride] Tu codigo de verificacion SMS es: ${verifyCode}`);
        if (!smsSent) {
            return res.status(500).json({ success: false, message: 'Error enviando el SMS. Verifica el número de teléfono.' });
        }
        
        res.status(200).json({ success: true, message: 'SMS enviado correctamente' });
    } catch (error) {
        console.error('[SMS Gen]', error);
        res.status(500).json({ success: false, message: 'Error interno de servidor al generar SMS' });
    }
};

const verifyPhoneOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) return res.status(400).json({ success: false, message: 'El OTP es requerido.' });
        
        const user = await User.findById(req.user._id).select('+verificationOTP +verificationOTPExpire');
        
        if (user.phoneVerified) {
            return res.status(400).json({ success: false, message: 'El teléfono ya está verificado.' });
        }
        if (!user.verificationOTP || user.verificationOTPExpire < Date.now()) {
            return res.status(400).json({ success: false, message: 'Código expirado o no solicitado.' });
        }
        
        const isMatch = await bcrypt.compare(otp, user.verificationOTP);
        
        // Security: No dev bypass — any environment must pass the real OTP check.
        // If testing locally, read the actual OTP from the sendSMS utility logs.
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Código SMS inválido.' });
        }
        
        user.phoneVerified = true;
        user.verificationOTP = undefined;
        user.verificationOTPExpire = undefined;
        await user.save();
        
        res.status(200).json({ success: true, message: 'Teléfono verificado exitosamente.' });
    } catch (e) {
        console.error('[Verify SMS Error]', e);
        res.status(500).json({ success: false, message: 'Error interno verificando SMS' });
    }
};

const deleteAccount = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        
        user.isBlocked = true;
        user.deletionRequested = true;
        user.deletionRequestedAt = Date.now();
        await user.save();
        
        await RefreshToken.updateMany({ user: user._id }, { $set: { used: true } });
        
        try {
            getIO().to(user._id.toString()).emit('force_logout', { message: 'Tu cuenta ha sido marcada para eliminación. La sesión se ha cerrado.' });
        } catch (e) {}
        
        res.status(200).json({ success: true, message: 'Cuenta en proceso de eliminación.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const getReferral = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('referralCode referralCount referralBonusEarned');
        if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        
        res.status(200).json({
             success: true,
             data: {
                 code: user.referralCode,
                 count: user.referralCount,
                 bonus: user.referralBonusEarned
             }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

const googleLogin = async (req, res) => {
    try {
        const { email, name, googleId, avatarUrl, accessToken } = req.body;
        if (!email || !googleId) {
            return res.status(400).json({ success: false, message: 'Email y Google ID son requeridos' });
        }

        // Verify the Google token is real by fetching userinfo
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!googleRes.ok) {
            return res.status(401).json({ success: false, message: 'Token de Google inválido' });
        }
        const googleUser = await googleRes.json();
        if (googleUser.email !== email) {
            return res.status(401).json({ success: false, message: 'Email no coincide con el token' });
        }


        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (!user) {
            // Create new user via Google
            const myReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            
            user = await User.create({
                name: name || googleUser.name,
                email,
                googleId,
                avatarUrl: avatarUrl || googleUser.picture,
                password: crypto.randomBytes(32).toString('hex'), // random password (won't be used)
                role: 'USER',
                isEmailVerified: true,
                emailVerified: true,
                referralCode: myReferralCode,
            });
        } else {
            if (!user.googleId) user.googleId = googleId;
            if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
            user.isEmailVerified = true;
            await user.save();
        }

        const jwtAccessToken = generateAccessToken(user._id);
        const rawRefreshToken = generateRefreshToken(user._id);

        const familyId = uuid.v4();
        await RefreshToken.create({
            token: rawRefreshToken,
            user: user._id,
            familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        res.status(200).json({
            success: true,
            data: {
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                approvalStatus: user.driverApprovalStatus || user.approvalStatus,
                accessToken: jwtAccessToken,
                refreshToken: rawRefreshToken,
            },
        });
    } catch (e) {
        console.error('[Auth] Google login error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};

const appleLogin = async (req, res) => {
    try {
        const { appleUserId, email, name, identityToken } = req.body;
        if (!appleUserId || !identityToken) {
            return res.status(400).json({ success: false, message: 'Apple User ID e identityToken son requeridos' });
        }

        // Verify the Apple identity token ensures the payload wasn't spoofed
        try {
            const appleUser = await appleSignin.verifyIdToken(identityToken, {
                // If you have a specific bundle ID, uncomment and set it in your env
                // audience: process.env.APPLE_BUNDLE_ID,
                ignoreExpiration: false,
            });
            if (appleUser.sub !== appleUserId) {
                return res.status(401).json({ success: false, message: 'Token de Apple no coincide con el Apple User ID' });
            }
        } catch (tokenErr) {
            return res.status(401).json({ success: false, message: 'Token de Apple inválido: ' + tokenErr.message });
        }


        // Find by appleId first, then by email
        let user = await User.findOne({ appleId: appleUserId });
        if (!user && email) {
            user = await User.findOne({ email });
        }

        if (!user) {
            // Create new user via Apple
            const myReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            
            user = await User.create({
                name: name || 'Usuario Apple',
                email: email || `${appleUserId}@privaterelay.appleid.com`,
                appleId: appleUserId,
                password: crypto.randomBytes(32).toString('hex'),
                role: 'USER',
                isEmailVerified: true,
                emailVerified: true,
                referralCode: myReferralCode,
            });
        } else {
            if (!user.appleId) user.appleId = appleUserId;
            user.isEmailVerified = true;
            await user.save();
        }

        const jwtAccessToken = generateAccessToken(user._id);
        const rawRefreshToken = generateRefreshToken(user._id);

        const familyId = uuid.v4();
        await RefreshToken.create({
            token: rawRefreshToken,
            user: user._id,
            familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        res.status(200).json({
            success: true,
            data: {
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                approvalStatus: user.driverApprovalStatus || user.approvalStatus,
                accessToken: jwtAccessToken,
                refreshToken: rawRefreshToken,
            },
        });
    } catch (e) {
        console.error('[Auth] Apple login error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
};



/**
 * firebaseSync
 * Llamado desde el frontend inmediatamente después de un signIn con Firebase.
 * Sincroniza/crea el usuario en MongoDB y devuelve el perfil completo.
 */
const firebaseSync = async (req, res) => {
  try {
    const user = req.user; // Ya resuelto por el middleware protect
    
    // Actualizar datos del perfil si vienen en el body (primer login con OAuth)
    const { name, avatarUrl, phoneNumber } = req.body;
    // NOTE: role is intentionally NOT accepted from the client body here.
    // Role escalation must go through the admin panel or onboarding approval flow.
    
    if (name && !user.name) user.name = name;
    if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
    if (phoneNumber && !user.phoneNumber) user.phoneNumber = phoneNumber;
    
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phoneNumber: user.phoneNumber,
        isEmailVerified: user.isEmailVerified,
        approvalStatus: user.driverApprovalStatus || user.approvalStatus,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
    logoutAll,
    uploadAvatar,
    updateProfile,
    resendVerification,
    sendPhoneOtp,
    verifyPhoneOtp,
    deleteAccount,
    getReferral,
    googleLogin,
    appleLogin,
    firebaseSync,
};
