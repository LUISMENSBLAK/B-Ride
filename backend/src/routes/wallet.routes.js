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

router.post('/topup', protect, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Monto inválido' });
  const user = await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: amount } }, { new: true });
  await WalletTransaction.create({ user: req.user._id, type: 'CREDIT', amount, description: 'Recarga manual' });
  res.json({ success: true, newBalance: user.walletBalance });
});

router.get('/transactions', protect, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const transactions = await WalletTransaction.find({ user: req.user._id })
    .sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit);
  res.json({ success: true, data: transactions });
});
module.exports = router;
