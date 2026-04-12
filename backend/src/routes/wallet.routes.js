const express = require('express');
const router = express.Router();
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const { protect } = require('../middlewares/auth.middleware');

router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('walletBalance');
        const transactions = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, balance: user.walletBalance, transactions });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
