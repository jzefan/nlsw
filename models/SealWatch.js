const mongoose = require('mongoose');

const sealWatchSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName: { type: String, default: '' },
  sealType: {
    type: String,
    enum: ['official', 'finance', 'contract', 'invoice', 'legal'],
    required: true,
    index: true
  },
  desiredFrom: { type: Date, required: true },
  desiredTo: { type: Date, required: true },
  status: {
    type: String,
    enum: ['waiting', 'notified', 'expired'],
    default: 'waiting',
    index: true
  },
  notifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

sealWatchSchema.index({ tenantId: 1, sealType: 1, status: 1 });
sealWatchSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('SealWatch', sealWatchSchema);
