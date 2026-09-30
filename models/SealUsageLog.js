const mongoose = require('mongoose');

const sealUsageLogSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  sealType: {
    type: String,
    enum: ['official', 'finance', 'contract', 'invoice', 'legal'],
    required: true,
    index: true
  },
  sealItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SealItem', default: null, index: true },
  sealItemCode: { type: String, default: '' },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'SealRequest', required: true, index: true },
  action: {
    type: String,
    enum: ['submit', 'approve', 'reject', 'withdraw', 'checkout', 'return', 'overdue', 'remind', 'watch_notified'],
    required: true,
    index: true
  },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  operatorName: { type: String, default: '' },
  at: { type: Date, default: Date.now, index: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String, default: '', trim: true }
});

sealUsageLogSchema.index({ tenantId: 1, sealItemId: 1, at: -1 });
sealUsageLogSchema.index({ tenantId: 1, sealType: 1, at: -1 });
sealUsageLogSchema.index({ tenantId: 1, requestId: 1, at: 1 });

module.exports = mongoose.model('SealUsageLog', sealUsageLogSchema);
