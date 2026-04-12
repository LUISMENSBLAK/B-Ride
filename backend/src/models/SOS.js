const mongoose = require('mongoose');

const sosSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        ride: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Ride',
            default: null
        },
        coordinates: {
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true }
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'RESOLVED'],
            default: 'ACTIVE'
        },
        resolutionNote: {
            type: String,
            default: null
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        resolvedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('SOS', sosSchema);
