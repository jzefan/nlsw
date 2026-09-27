const mongoose = require('mongoose');

// Deliberately has no TTL: an in-flight request must never lose ownership due to a slow DB call.
// If a process exits before its finally block, an operator must verify the request state before
// clearing the stale tenant/applicant row.
const attendanceSubmissionLockSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  acquiredAt: { type: Date, required: true, default: Date.now },
  ownerPid: { type: Number, required: true },
  ownerHost: { type: String, required: true }
}, { versionKey: false, collection: 'attendance_submission_locks_v2' });

attendanceSubmissionLockSchema.index({ tenantId: 1, applicantId: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceSubmissionLock', attendanceSubmissionLockSchema);
