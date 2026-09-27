const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceMonthLedger', required: true, index: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  action: { type: String, enum: ['closed', 'reopened'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, { versionKey: false });

schema.index({ tenantId: 1, month: 1, at: 1 });
module.exports = mongoose.model('AttendanceLedgerAudit', schema);
