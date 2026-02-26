const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  orderNo: {
    type: String,
    unique: true,
    required: true,
  },
  plan: {
    type: String,
    enum: ['basic', 'enterprise'],
    default: 'basic',
  },
  amount: {
    type: Number,
    default: 0,
  },
  startDate: Date,
  endDate: Date,
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled', 'refunded'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
    default: '',
  },
  paidAt: Date,
  notes: {
    type: String,
    default: '',
  },
  creator: String,
  createDate: {
    type: Date,
    default: Date.now,
  },
});

orderSchema.index({ status: 1 });
orderSchema.index({ createDate: -1 });

module.exports = mongoose.model('Order', orderSchema);
