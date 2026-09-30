const mongoose = require('mongoose');

const sealApprovalSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['general_manager', 'owner', 'delegate'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  comment: { type: String, trim: true, maxlength: 2000, default: '' },
  reviewedAt: Date
}, { _id: false });

const assignedSealItemSchema = new mongoose.Schema({
  sealItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SealItem', required: true },
  code: { type: String, required: true },
  sealType: { type: String, required: true }
}, { _id: false });

const sealRequestSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  serialNo: { type: String, required: true }, // e.g. '000008'
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  applicant: {
    employeeNo: { type: String, default: '' },
    name: { type: String, default: '' },
    department: { type: String, default: '' },
    title: { type: String, default: '' }
  },
  useDepartment: { type: String, default: '', trim: true },
  useAt: { type: Date, required: true },
  expectedReturnAt: { type: Date, required: true },
  actualReturnAt: { type: Date, default: null },
  sealTypes: [{
    type: String,
    enum: ['official', 'finance', 'contract', 'invoice', 'legal'],
    required: true
  }],
  documentName: { type: String, required: true, trim: true, maxlength: 200 },
  copies: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true, maxlength: 4000 },
  remark: { type: String, default: '', trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'checked_out', 'overdue', 'returned', 'rejected', 'withdrawn'],
    default: 'pending',
    index: true
  },
  approvals: { type: [sealApprovalSchema], default: [] },
  currentApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  sealItems: { type: [assignedSealItemSchema], default: [] },
  checkedOutAt: { type: Date, default: null },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  operatorName: { type: String, default: '' },
  returnNote: { type: String, default: '', trim: true, maxlength: 1000 },
  reminders: { type: [String], default: [] },
  withdrawnAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

sealRequestSchema.index({ tenantId: 1, serialNo: 1 }, { unique: true });
sealRequestSchema.index({ tenantId: 1, applicantId: 1, createdAt: -1 });
sealRequestSchema.index({ tenantId: 1, currentApproverId: 1, status: 1, createdAt: -1 });
sealRequestSchema.index({ tenantId: 1, sealTypes: 1, status: 1, useAt: 1, expectedReturnAt: 1 });
sealRequestSchema.index({ tenantId: 1, status: 1, expectedReturnAt: 1 });

module.exports = mongoose.model('SealRequest', sealRequestSchema);
