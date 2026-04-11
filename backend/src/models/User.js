const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please add a name'],
        },
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'Please add a valid email',
            ],
        },
        password: {
            type: String,
            required: [true, 'Please add a password'],
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: ['USER', 'DRIVER', 'ADMIN'],
            default: 'USER',
        },
        phoneNumber: {
            type: String,
            required: false,
        },
        avatarUrl: {
            type: String,
            default: null,
        },

        // ─── V1: DATOS DE VEHÍCULO (CONDUCTOR) ─────────────────────────
        vehicle: {
            make:     { type: String, default: '' },   // marca
            model:    { type: String, default: '' },   // modelo
            year:     { type: Number, default: null },
            color:    { type: String, default: '' },
            plate:    { type: String, default: '' },   // matrícula
            type:     { type: String, enum: ['SEDAN', 'SUV', 'VAN', 'MOTO', 'OTHER'], default: 'SEDAN' },
            capacity: { type: Number, default: 4 },
        },

        // ─── V1/B1: DOCUMENTOS DEL CONDUCTOR ───────────────────────────────
        documents: {
            licenseUrl:       { type: String, default: null }, // Mantenido por retro
            insuranceUrl:     { type: String, default: null },
            registrationUrl:  { type: String, default: null },
            vehiclePhotoUrl:  { type: String, default: null },
        },
        driverLicense: {
            frontPhoto: { type: String, default: null },
            backPhoto: { type: String, default: null },
            number: { type: String, default: null },
            expiryDate: { type: Date, default: null },
        },
        vehicleRegistration: {
            photo: { type: String, default: null },
            expiryDate: { type: Date, default: null },
        },

        // ─── V2: APROBACIÓN DE CONDUCTOR (Bloque 1) ────────────────────────────────
        driverApprovalStatus: { // Solicitado renombrar desde approvalStatus (aunque lo mantendré compatible)
            type: String,
            enum: ['PENDING_DOCS', 'DOCS_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
            default: 'PENDING_DOCS',
        },
        approvalStatus: { type: String, enum: ['PENDING_DOCS', 'DOCS_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'], default: 'PENDING_DOCS' },
        rejectionReason: { type: String, default: null },

        // ─── S2/B2: VERIFICACIÓN ───────────────────────────────────────────
        emailVerified: { type: Boolean, default: false },
        isEmailVerified: { type: Boolean, default: false }, // Compatibilidad requerida en prompt
        emailVerificationToken: { type: String, select: false },
        emailVerificationExpires: { type: Date, select: false },
        
        phoneVerified: { type: Boolean, default: false },
        verificationOTP: { type: String, select: false },
        verificationOTPExpire: { type: Date, select: false },

        // ─── S4: CONTACTO DE EMERGENCIA ─────────────────────────────────
        emergencyContact: {
            name:  { type: String, default: null },
            phone: { type: String, default: null },
            relation: { type: String, default: null },
        },

        // ─── UX-B: DIRECCIONES GUARDADAS ────────────────────────────────
        savedAddresses: [{
            label:     { type: String },  // 'Casa', 'Trabajo', etc.
            address:   { type: String },
            latitude:  { type: Number },
            longitude: { type: Number },
        }],

        // ─── UX-D: DESTINOS RECIENTES ───────────────────────────────────
        recentDestinations: [{
            address:   { type: String },
            latitude:  { type: Number },
            longitude: { type: Number },
            usedAt:    { type: Date, default: Date.now },
        }],

        // ─── WEEK 4: ACEPTACIÓN DE TÉRMINOS ────────────────────────────
        termsAcceptedAt: { type: Date, default: null },

        // ─── F1/B2: ANTIFRAUDE E IDENTIDAD DE DISPOSITIVO ──────────────────────
        deviceIds: [{ type: String }],
        knownDevices: [{
            deviceId: String,
            deviceName: String,
            platform: String,
            firstSeen: { type: Date, default: Date.now },
            lastSeen: { type: Date, default: Date.now }
        }],
        lastDeviceId: { type: String, default: null },
        
        // Bloqueo de fuerza bruta de Auth
        loginAttempts: { type: Number, default: 0 },
        lockUntil: { type: Date, default: null },

        // --- DRIVER PRODUCTION STATES ---
        driverStatus: {
            type: String,
            enum: ['OFFLINE', 'AVAILABLE', 'ON_TRIP'],
            default: 'OFFLINE',
        },
        lastKnownLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] }
        },

        // --- SISTEMA DE RATINGS ---
        avgRating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0 },
        ratings: [{
            score:   { type: Number, required: true, min: 1, max: 5 },
            rideId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
            from:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        }],
        acceptanceRate: { type: Number, default: 1.0 },
        avgResponseTimeMs: { type: Number, default: 5000 },

        // --- STRIPE CONNECT ---
        stripeAccountId: { type: String, select: false },
        stripeCustomerId: { type: String, select: false },
        onboardingComplete: { type: Boolean, default: false },

        // --- ANTIFRAUDE ---
        isFlagged: { type: Boolean, default: false },
        isBlocked: { type: Boolean, default: false },
        failedPaymentCount: { type: Number, default: 0 },
        canceledRideCount: { type: Number, default: 0 },

        // --- PUSH ---
        expoPushTokens: { type: [String], default: [], select: false },

        // --- PASSWORD RESET ---
        resetPasswordToken: String,
        resetPasswordExpire: Date,
    },
    { timestamps: true }
);

// Virtual para saber si la cuenta está bloqueada ahora por intentos fallidos
userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});


// B4: Índices clave para rendimiento
userSchema.index({ lastKnownLocation: '2dsphere' });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, driverStatus: 1 });
userSchema.index({ 'vehicle.plate': 1 });
userSchema.index({ approvalStatus: 1 });
userSchema.index({ deviceIds: 1 });

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(20).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    return resetToken;
};

module.exports = mongoose.model('User', userSchema);
