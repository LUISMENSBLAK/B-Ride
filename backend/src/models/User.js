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
            select: false, // Don't return password by default
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
        // avgRating: valor desnormalizado (pre-calculado) para lecturas O(1) en bid cards
        avgRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        totalRatings: {
            type: Number,
            default: 0,
        },
        ratings: [{
            score:   { type: Number, required: true, min: 1, max: 5 },
            rideId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
            from:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        }],
        acceptanceRate: {
            type: Number,
            default: 1.0 // 100% initial
        },
        avgResponseTimeMs: {
            type: Number,
            default: 5000 // 5 seconds initial average
        },
        // --- STRIPE CONNECT ---
        stripeAccountId: {
            type: String,
            select: false,
        },
        stripeCustomerId: {
            type: String,
            select: false,
        },
        onboardingComplete: {
            type: Boolean,
            default: false
        },
        // --- ANTIFRAUDE ---
        isFlagged: {
            type: Boolean,
            default: false
        },
        failedPaymentCount: {
            type: Number,
            default: 0
        },
        canceledRideCount: {
            type: Number,
            default: 0
        },
        // -----------------------------------------------
        expoPushTokens: {
            type: [String],
            default: [],
            select: false, // Don't return by default for security, but backend can query it when needed
        },
        resetPasswordToken: String,
        resetPasswordExpire: Date,
    },
    {
        timestamps: true,
    }
);

// GeoSpatial Index for fast matching of nearby drivers
userSchema.index({ lastKnownLocation: '2dsphere' });

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
    const crypto = require('crypto');
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire (10 minutes)
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

module.exports = mongoose.model('User', userSchema);
