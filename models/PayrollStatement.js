const mongoose = require('mongoose');

const moneyFields = {
  basicPayCents: { type: Number, default: 0, min: 0 },
  performancePayCents: { type: Number, default: 0, min: 0 },
  positionPayCents: { type: Number, default: 0, min: 0 },
  seniorityPayCents: { type: Number, default: 0, min: 0 },
  attendanceBonusCents: { type: Number, default: 0, min: 0 },
  transportAllowanceCents: { type: Number, default: 0, min: 0 },
  lunchAllowanceCents: { type: Number, default: 0, min: 0 },
  overtimeAllowanceCents: { type: Number, default: 0, min: 0 },
  employerSocialInsuranceCents: { type: Number, default: 0, min: 0 },
  employerHousingFundCents: { type: Number, default: 0, min: 0 },
  employeeSocialInsuranceCents: { type: Number, default: 0, min: 0 },
  employeeHousingFundCents: { type: Number, default: 0, min: 0 },
  sickLeaveDeductionCents: { type: Number, default: 0, min: 0 },
  personalLeaveDeductionCents: { type: Number, default: 0, min: 0 },
  absenceDeductionCents: { type: Number, default: 0, min: 0 },
  incomeTaxCents: { type: Number, default: 0, min: 0 },
};

const componentsSchema = new mongoose.Schema(moneyFields, { _id: false, id: false });
const totalsSchema = new mongoose.Schema({
  incomeSubtotalCents: { type: Number, required: true, min: 0 },
  employerContributionCents: { type: Number, required: true, min: 0 },
  totalCompensationCents: { type: Number, required: true, min: 0 },
  attendanceDeductionCents: { type: Number, required: true, min: 0 },
  payableBeforePersonalDeductionsCents: { type: Number, required: true, min: 0 },
  netPayCents: { type: Number, required: true, min: 0 },
}, { _id: false });

const employeeSnapshotSchema = new mongoose.Schema({
  employeeNo: { type: String, default: '' },
  phone: { type: String, default: '' },
  name: { type: String, default: '' },
  department: { type: String, default: '' },
}, { _id: false });

const publishedRevisionSchema = new mongoose.Schema({
  revision: { type: Number, required: true, min: 1 },
  employee: { type: employeeSnapshotSchema, required: true },
  components: { type: componentsSchema, required: true },
  totals: { type: totalsSchema, required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedAt: { type: Date, required: true },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  direction: { type: String, enum: ['payment', 'refund'], required: true },
  amountCents: { type: Number, required: true, min: 1 },
  paidAt: { type: Date, required: true },
  proofUrl: { type: String, trim: true, default: '', maxlength: 1000 },
  note: { type: String, trim: true, default: '', maxlength: 2000 },
  statementRevision: { type: Number, required: true, min: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const eventSchema = new mongoose.Schema({
  // withdrawn 撤回；forced_publish 在当月考勤未结账时强制发布（财务显式跳过结账前置条件）。
  action: { type: String, enum: ['withdrawn', 'forced_publish'], required: true },
  revision: { type: Number, required: true, min: 1 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // 只有撤回需要填原因；强制发布不要求财务填写，按当时台账状态留痕即可。
  reason: { type: String, trim: true, maxlength: 2000, required: function () { return this.action === 'withdrawn'; } },
  // 强制发布那一刻的考勤台账状态快照（open 未结账 / missing 未建台账），不随后续结账变化。
  ledgerStatus: { type: String, enum: ['open', 'missing'] },
  at: { type: Date, default: Date.now },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  employee: { type: employeeSnapshotSchema, required: true },
  draft: {
    components: { type: componentsSchema, default: undefined },
    totals: { type: totalsSchema, default: undefined },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date,
  },
  revisions: { type: [publishedRevisionSchema], default: [] },
  currentPublishedRevision: { type: Number, default: null },
  events: { type: [eventSchema], default: [] },
  payments: { type: [paymentSchema], default: [] },
  version: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { optimisticConcurrency: true });

schema.index({ tenantId: 1, employeeId: 1, month: 1 }, { unique: true });
schema.index({ tenantId: 1, month: 1, 'employee.department': 1, 'employee.employeeNo': 1 });
schema.index({ tenantId: 1, 'payments.paidAt': 1 });

module.exports = mongoose.model('PayrollStatement', schema);
