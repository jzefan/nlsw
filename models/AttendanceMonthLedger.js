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
  /**
   * 实到分钟的来源：'auto' = 用系统建议值（后续导入/日历变化时会跟着重算），
   * 'manual' = 人工改过（不再被自动建议覆盖）。没有标记的历史行按「有值即人工」处理。
   */
  actualMinutesSource: { type: String, enum: ['auto', 'manual'], default: undefined },
  confirmationState: { type: String, enum: ['pending', 'confirmed', 'no_basis'], default: 'pending' },
  note: { type: String, default: '', maxlength: 2000 },
  /**
   * 由考勤机 / 考勤表导入的记录（次数）。作为「实到分钟」自动计算的扣减依据，
   * 但本身不等于实到、也不参与金额计算——实到仍由考勤管理员确认或修改。
   * 单位都是**次数**，值为 null 表示「没导入过」；导入时空白单元格不动，不会把已确认的内容清空。
   */
  lateWithin10: { type: Number, default: null },
  lateOver10: { type: Number, default: null },
  lateTotal: { type: Number, default: null },
  earlyLeave: { type: Number, default: null },
  noClockRecord: { type: Number, default: null },
  /** 导入表里的备注；与确认说明 note 分开存，避免互相覆盖 */
  importNote: { type: String, default: '', maxlength: 2000 },
  importedAt: { type: Date, default: null },
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
