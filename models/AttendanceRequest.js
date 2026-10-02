const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['manager', 'general_manager', 'general_manager_delegate'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  comment: { type: String, trim: true, maxlength: 2000, default: '' },
  reviewedAt: Date
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true, maxlength: 120 },
  size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 }
}, { _id: false });

const attendanceRequestSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  applicant: {
    employeeNo: { type: String, default: '' },
    name: { type: String, default: '' },
    department: { type: String, default: '' },
    title: { type: String, default: '' }
  },
  type: { type: String, enum: ['leave', 'overtime', 'fieldwork', 'appeal'], required: true },
  leaveType: { type: String, enum: ['personal', 'sick', 'annual', 'marriage', 'maternity', 'paternity', 'bereavement', 'parental', 'compensatory', 'other'] },
  /** 加班补偿方式：调休 / 加班费 / 无补偿（申请时默认无补偿） */
  compensation: { type: String, enum: ['comp_time', 'overtime_pay', 'none'] },
  /**
   * 考勤申述专属：申述的是**哪一天**的哪一类考勤异常。
   * 申述没有时间区间概念，所以 startAt / endAt / durationMinutes 对申述不必填（见下面的条件 required）。
   * appealType 取值与台账「导入考勤记录」的次数口径一一对应，另有 absence（旷工，台账无对应计数、只留痕）。
   */
  occurredOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  appealType: { type: String, enum: ['lateWithin10', 'lateOver10', 'earlyLeave', 'noClockRecord', 'absence'] },
  startAt: { type: Date, required: function () { return this.type !== 'appeal' } },
  endAt: { type: Date, required: function () { return this.type !== 'appeal' } },
  durationMinutes: { type: Number, required: function () { return this.type !== 'appeal' }, min: 1 },
  // Persist calculated per-business-day leave values so later calendar edits do not rewrite history.
  leaveAllocations: [{
    date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    minutes: { type: Number, min: 0 }
  }],
  reason: { type: String, trim: true, required: true, maxlength: 4000 },
  location: { type: String, trim: true, default: '', maxlength: 500 },
  contact: { type: String, trim: true, default: '', maxlength: 500 },
  workContent: { type: String, trim: true, default: '', maxlength: 2000 },
  attachments: { type: [attachmentSchema], default: [] },
  attachmentUrls: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', index: true },
  approvals: { type: [approvalSchema], default: [] },
  currentApproverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  withdrawnAt: Date
});

attendanceRequestSchema.index({ tenantId: 1, applicantId: 1, createdAt: -1 });
attendanceRequestSchema.index({ tenantId: 1, currentApproverId: 1, status: 1, createdAt: -1 });
attendanceRequestSchema.index({ tenantId: 1, 'applicantId': 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
