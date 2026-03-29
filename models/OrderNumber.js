var mongoose = require('mongoose');

var orderNumberSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  type: { type: String, enum: ['order_no', 'bill_no'], required: true },
  value: { type: String, required: true },
  create_time: { type: Date, default: Date.now }
});

// 租户内 type+value 唯一
orderNumberSchema.index({ tenantId: 1, type: 1, value: 1 }, { unique: true });

module.exports = mongoose.model('OrderNumber', orderNumberSchema);
