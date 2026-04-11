const mongoose = require('mongoose');

/**
 * S5/O1: Modelo de reportes post-viaje y soporte
 */
const reportSchema = new mongoose.Schema({
    rideId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
    reporter:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['SAFETY', 'FRAUD', 'BEHAVIOR', 'VEHICLE', 'ROUTE', 'PAYMENT', 'SOS', 'OTHER'],
        required: true,
    },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
        default: 'OPEN',
    },
    resolution: { type: String, default: null },
    // S1: Datos de SOS
    sosData: {
        latitude:  { type: Number },
        longitude: { type: Number },
        timestamp: { type: Date },
    },
}, { timestamps: true });

reportSchema.index({ rideId: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ reporter: 1 });

module.exports = mongoose.model('Report', reportSchema);
