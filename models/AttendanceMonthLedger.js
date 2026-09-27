const mongoose = require('mongoose');

const employeeRowSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeNo: { type: String, default: '' },
  phone: { type: String, default: '' },
  userid: { type: String, default: '' },
  name: { type: String, default: '' },
  department: { type: String, default: '' },
  expectedMinutes: { type: Number, default: 0 },
  actualMinutes: { type: Number, default: null },
  confirmationState: { type: String, enum: ['pending', 'confirmed', 'no_basis'], default: 'pending' },
  note: { type: String, default: '', maxlength: 2000 },
  version: { type: Number, default: 0 }
}, { _id: false });

const auditSchema = new mongoose.Schema({
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLedgerAudit', required: true },
  action: { type: String, enum: ['closed', 'reopened'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  version: { type: Number, default: 0 },
  mutationToken: { type: String, default: undefined, select: false },
  mutationAcquiredAt: { type: Date, default: undefined },
  mutationOwnerPid: { type: Number, default: undefined },
  mutationOwnerHost: { type: String, default: undefined },
  rows: { type: [employeeRowSchema], default: [] },
  closedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  closeAudit: { type: [auditSchema], default: [] },
  closedAt: Date,
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { optimisticConcurrency: true });

schema.index({ tenantId: 1, month: 1 }, { unique: true });
module.exports = mongoose.model('AttendanceMonthLedger', schema);
