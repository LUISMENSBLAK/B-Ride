const mongoose = require('mongoose');

const sosSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    status: {
        type: String,
        enum: ['TRIGGERED', 'RESOLVED', 'FALSE_ALARM'],
        default: 'TRIGGERED'
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

sosSchema.index({ location: '2dsphere' });
sosSchema.index({ ride: 1 });
sosSchema.index({ user: 1 });
sosSchema.index({ status: 1 });

module.exports = mongoose.model('SOS', sosSchema);
