const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    referenceId: { type: String } // Puede ser Ride ID o Payment Intent ID
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
