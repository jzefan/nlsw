const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: {
    type: String,
    enum: ['seal_approved', 'seal_returned', 'seal_overdue', 'seal_overdue_escalate', 'general',
      'attendance_pending', 'attendance_approved', 'attendance_rejected'],
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  link: { type: String, default: '', trim: true },
  readAt: { type: Date, default: null, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
});

noticeSchema.index({ tenantId: 1, userId: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notice', noticeSchema);
