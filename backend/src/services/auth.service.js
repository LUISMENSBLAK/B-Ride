const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwtUtils');
const sendEmail = require('../utils/sendEmail');

const RefreshToken = require('../models/RefreshToken');
const uuid = require('uuid');

class AuthService {
    async register(userData) {
        const { name, email, password, role, phoneNumber, referralCode } = userData;

        const userExists = await User.findOne({ email });
        if (userExists) {
            throw new Error('El correo electrónico ya está registrado.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Bloque 2: Generar y guardar código 6 dígitos
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = await bcrypt.hash(verifyCode, salt);

        // Generar referral code unico
        const crypto = require('crypto');
        const myReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

        let referredById = null;
        if (referralCode) {
            const referent = await User.findOne({ referralCode });
            if (referent) {
                referredById = referent._id;
            }
        }

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || 'USER',
            phoneNumber,
            referralCode: myReferralCode,
            referredBy: referredById,
            isEmailVerified: false,
            emailVerificationToken: hashedCode,
            emailVerificationExpires: Date.now() + 15 * 60 * 1000,
        });

        try {
            await sendEmail({
                email,
                subject: 'Bienvenido a B-Ride',
                message: 'Hola, gracias por registrarte en B-Ride. Tu cuenta ha sido creada exitosamente.',
                code: verifyCode
            });
        } catch (emailError) {
            console.error('[Auth] Error enviando email de bienvenida:', emailError.message);
        }

        const accessToken = generateAccessToken(user._id);
        const refreshTokenStr = generateRefreshToken(user._id);

        const familyId = uuid.v4();
        await RefreshToken.create({
            token: refreshTokenStr,
            user: user._id,
            familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        // Do NOT bypass email verify
        // Keep tokens so frontend can login and show VerifyEmail block
        return {
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            accessToken,
            refreshToken: refreshTokenStr,
        };
    }

    async login(email, password, deviceMeta) {
        const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
        if (!user) throw new Error('Invalid credentials');

        // B2: Account Lockout
        if (user.isLocked) {
           const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
           throw new Error(`Cuenta bloqueada. Intenta de nuevo en ${mins} minutos.`);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            user.loginAttempts += 1;
            if (user.loginAttempts >= 5) {
                user.lockUntil = Date.now() + 15 * 60 * 1000;
            }
            await user.save();
            throw new Error('Invalid credentials');
        }

        // B2: Email Verify Check
        if (!user.isEmailVerified && !user.emailVerified) {
            // Re-generar token (no lanzamos error para que puedan entrar y ver la pantalla de Verificación)
            const salt = await bcrypt.genSalt(10);
            const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
            user.emailVerificationToken = await bcrypt.hash(verifyCode, salt);
            user.emailVerificationExpires = Date.now() + 15 * 60 * 1000;
            await user.save();
            try {
                await sendEmail({
                    email,
                    subject: 'Tu código de verificación - B-Ride',
                    message: 'Hemos generado un código para ti. Úsalo para verificar tu cuenta en la aplicación.',
                    code: verifyCode
                });
            } catch (emailErr) {
                console.error('[Auth] Error enviando email de OTP en login:', emailErr.message);
            }
        }

        // B2: Success -> Reset Attempts
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        
        // B2: Dispositivo Nuevo Tracking
        if (deviceMeta && deviceMeta.deviceId) {
            const isKnown = user.knownDevices.find(d => d.deviceId === deviceMeta.deviceId);
            if (!isKnown) {
                user.knownDevices.push({
                    deviceId: deviceMeta.deviceId,
                    deviceName: deviceMeta.deviceName || 'Desconocido',
                    platform: deviceMeta.platform || 'Unknown',
                    firstSeen: Date.now(),
                    lastSeen: Date.now()
                });
                try {
                    await sendEmail({
                        email,
                        subject: 'Alerta de Seguridad - Nuevo Dispositivo en B-Ride',
                        message: `Hemos detectado un nuevo inicio de sesión en tu cuenta de B-Ride desde un nuevo dispositivo.<br/><br/>
                        <strong>Dispositivo:</strong> ${deviceMeta.deviceName || 'Desconocido'}<br/>
                        <strong>Plataforma:</strong> ${deviceMeta.platform || 'Unknown'}<br/>
                        <strong>Fecha:</strong> ${new Date().toISOString()}<br/><br/>
                        Si no fuiste tú, por favor contacta a soporte inmediatamente.`
                    });
                } catch (secErr) {
                    console.error('[Auth] Error sending security email:', secErr.message);
                }
            } else {
                isKnown.lastSeen = Date.now();
            }
        }
        await user.save();

        const accessToken = generateAccessToken(user._id);
        const rawRefreshToken = generateRefreshToken(user._id);

        // B2: Familia de Tokens
        const familyId = uuid.v4();
        await RefreshToken.create({
            token: rawRefreshToken,
            user: user._id,
            familyId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        return {
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified || user.emailVerified || false,
            approvalStatus: user.driverApprovalStatus || user.approvalStatus,
            accessToken,
            refreshToken: rawRefreshToken,
        };
    }
}

module.exports = new AuthService();
