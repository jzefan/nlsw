const mongoose = require('mongoose');

const sealItemSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  sealType: {
    type: String,
    enum: ['official', 'finance', 'contract', 'invoice', 'legal'],
    required: true,
    index: true
  },
  code: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['active', 'disabled', 'scrapped'],
    default: 'active',
    index: true
  },
  physicalOut: { type: Boolean, default: false },
  currentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'SealRequest', default: null },
  currentBorrowerName: { type: String, default: '' },
  borrowCount: { type: Number, default: 0 },
  note: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

sealItemSchema.index({ tenantId: 1, sealType: 1, status: 1 });
sealItemSchema.index({ tenantId: 1, sealType: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('SealItem', sealItemSchema);
