const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
    {
        passenger: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        pickupLocation: {
            // Legacy Compatibility
            latitude: { type: Number, required: false },
            longitude: { type: Number, required: false },
            address: { type: String, required: true },
            // GeoJSON (Producción Escala)
            location: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: { type: [Number], required: false } // [lng, lat]
            }
        },
        dropoffLocation: {
            // Legacy Compatibility
            latitude: { type: Number, required: false },
            longitude: { type: Number, required: false },
            address: { type: String, required: true },
            // GeoJSON (Producción Escala)
            location: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: { type: [Number], required: false } // [lng, lat]
            }
        },
        proposedPrice: {
            type: Number,
            required: [true, 'Please propose a price for the ride'],
        },
        pricingMeta: {
            surgeMultiplier: { type: Number, default: 1.0 },
            zoneId: { type: String, default: null },
            timestamp: { type: Date, default: null }
        },
        // --- BIDDING SYSTEM ---
        bids: [{
            driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            price: { type: Number, required: true },
            status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
            createdAt: { type: Date, default: Date.now }
        }],
        // ----------------------
        status: {
            type: String,
            enum: ['REQUESTED', 'NEGOTIATING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
            default: 'REQUESTED',
        },
        version: {
            type: Number,
            default: 1
        },
        // --- PAGOS STRIPE ---
        paymentStatus: {
            type: String,
            enum: ['PENDING', 'HOLD', 'PROCESSING', 'CAPTURED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'DISPUTE_WON', 'DISPUTE_LOST'],
            default: 'PENDING'
        },
        paymentIntentId: {
            type: String,
            default: null
        },
        // --- POST-PAGOS Y AUDITORÍA ---
        stripeRefundId: {
            type: String,
            default: null
        },
        amountRefunded: {
            type: Number,
            default: 0
        },
        paymentEvents: [{
            type: { type: String, enum: ['CAPTURE', 'REFUND', 'DISPUTE', 'FAILED', 'CANCELED', 'HOLD'] },
            timestamp: { type: Date, default: Date.now },
            metadata: { type: mongoose.Schema.Types.Mixed }
        }]
    },
    {
        timestamps: true,
    }
);

// GeoSpatial Index for Uber-level matching
rideSchema.index({ 'pickupLocation.location': '2dsphere' });
rideSchema.index({ 'dropoffLocation.location': '2dsphere' });

// TTL Expiration: Elimina viajes abandonados automáticamente pasadas 3 horas (10800s)
rideSchema.index({ createdAt: 1 }, { expireAfterSeconds: 10800 });

module.exports = mongoose.model('Ride', rideSchema);
