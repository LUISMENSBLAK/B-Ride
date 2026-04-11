const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    familyId: {
        type: String,
        required: true,
    },
    used: {
        type: Boolean,
        default: false,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    deviceId: {
        type: String,
        default: null,
    }
}, { timestamps: true });

// Índice de expiración TTL (MongoDB limpiará automáticamente los tokens expirados)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ token: 1 });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ user: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
