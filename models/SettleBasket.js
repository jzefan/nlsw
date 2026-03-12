const mongoose = require('mongoose');

const settleBasketSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, index: true },
  userId: { type: String, required: true },
  basketType: { type: String, required: true, enum: ['vessel', 'bill'] },
  items: [mongoose.Schema.Types.Mixed],
  isPublic: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

settleBasketSchema.index({ tenantId: 1, userId: 1, basketType: 1 }, { unique: true });

module.exports = mongoose.model('SettleBasket', settleBasketSchema);
